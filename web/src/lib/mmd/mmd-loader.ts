import * as THREE from 'three';
import { MMDLoader } from '@/lib/vendor/mmd/MMDLoader.js';

export interface MMDLoadOptions {
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  resourcePath?: string;
  useTextureCache?: boolean;
  textureCacheMaxSize?: number;
  preferWebpTextures?: boolean;
}

export interface MMDModelWithAnimation {
  mesh: THREE.SkinnedMesh;
  clip: THREE.AnimationClip;
}

type TextureLoadHook = (
  filePath: string,
  textures: Record<string, THREE.Texture>,
  params?: unknown,
  onProgress?: (event: ProgressEvent<EventTarget>) => void,
  onError?: (error: unknown) => void
) => THREE.Texture;

type MMDMaterialBuilderWithTextureHook = {
  _loadTexture?: TextureLoadHook;
  resourcePath?: string;
  __sharedTextureCachePatched?: boolean;
};

type MMDLoaderWithMaterialBuilder = MMDLoader & {
  meshBuilder?: {
    materialBuilder?: MMDMaterialBuilderWithTextureHook;
  };
  resourcePath?: string;
};

interface TextureCacheEntry {
  key: string;
  texture: THREE.Texture;
  refCount: number;
  lastUsedAt: number;
}

interface TextureCacheStats {
  size: number;
  maxSize: number;
  activeRefs: number;
}

type TextureWithReadyCallbacks = THREE.Texture & {
  readyCallbacks?: Array<(texture: THREE.Texture) => void>;
  __readyCallbacksFlushScheduled?: boolean;
};

export interface WaitTextureReadyOptions {
  timeoutMs?: number;
}

export interface WaitTextureReadyResult {
  total: number;
  pending: number;
  timedOut: boolean;
}

const WEBP_TEXTURE_SOURCE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.bmp',
  '.tga',
  '.gif',
  '.sph',
  '.spa',
]);
const DEBUG_MMD_WEBP = process.env.NEXT_PUBLIC_DEBUG_MMD_WEBP === '1';
let debugWebpRewriteLogCount = 0;

function toEncodedUrl(url: string): string {
  const normalized = url.trim();
  try {
    // 避免对已编码路径再次编码（%E6... -> %25E6...）。
    return encodeURI(decodeURI(normalized));
  } catch {
    return encodeURI(normalized);
  }
}

function toDirectoryUrl(url: string): string {
  const normalized = url.trim().replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex < 0) {
    return '/';
  }
  return normalized.slice(0, slashIndex + 1);
}

function toProgressPercent(event: ProgressEvent<EventTarget>): number {
  if (!event.total || event.total <= 0) {
    return 0;
  }
  const ratio = event.loaded / event.total;
  return Math.max(0, Math.min(100, ratio * 100));
}

function normalizeError(rawError: unknown): Error {
  if (rawError instanceof Error) {
    return rawError;
  }
  if (typeof rawError === 'string' && rawError.trim()) {
    return new Error(rawError);
  }
  return new Error('MMD 资源加载失败');
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function normalizeToonRelativePath(filePath: string): string {
  return filePath.replace(/^(?:\.\.\/)+(?:pmx\/)?(toon\d+\.(?:png|bmp))$/i, '$1');
}

function normalizeMmdTexturePath(filePath: string): string {
  if (!filePath) {
    return filePath;
  }

  // 对绝对 URL（http/blob/data 等）不做结构改写，避免破坏协议头。
  if (/^[a-z][a-z0-9+.-]*:/i.test(filePath)) {
    return filePath;
  }

  const normalized = filePath.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
  return normalizeToonRelativePath(normalized);
}

function isAbsoluteUri(filePath: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(filePath);
}

function splitQueryAndHash(filePath: string): { path: string; suffix: string } {
  const match = filePath.match(/^([^?#]*)([?#].*)?$/);
  if (!match) {
    return { path: filePath, suffix: '' };
  }
  return {
    path: match[1] ?? '',
    suffix: match[2] ?? '',
  };
}

function isDefaultToonTexture(params?: unknown): boolean {
  const options = params as { isDefaultToonTexture?: boolean } | undefined;
  return options?.isDefaultToonTexture === true;
}

export function resolveMmdTextureRequestPath(
  filePath: string,
  params?: unknown,
  preferWebpTextures = true
): string {
  if (!preferWebpTextures) {
    return filePath;
  }
  if (!filePath || isAbsoluteUri(filePath) || isDefaultToonTexture(params)) {
    return filePath;
  }

  const { path, suffix } = splitQueryAndHash(filePath);
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex <= 0) {
    return filePath;
  }

  const extension = path.slice(dotIndex).toLowerCase();
  if (!WEBP_TEXTURE_SOURCE_EXTENSIONS.has(extension)) {
    return filePath;
  }
  return `${path.slice(0, dotIndex)}.webp${suffix}`;
}

function buildTextureCacheKey(resourcePath: string, filePath: string, params?: unknown): string {
  const normalizedFilePath = normalizePath(filePath.trim());
  if (isDefaultToonTexture(params)) {
    return `toon://${normalizedFilePath.toLowerCase()}`;
  }
  const normalizedResourcePath = normalizePath(resourcePath || '');
  return `tex://${`${normalizedResourcePath}${normalizedFilePath}`.toLowerCase()}`;
}

function pushTextureIfPresent(value: unknown, textures: Set<THREE.Texture>): void {
  if (value instanceof THREE.Texture) {
    textures.add(value);
  }
}

function ensureReadyCallbacksQueue(texture: THREE.Texture): void {
  const target = texture as TextureWithReadyCallbacks;
  if (Array.isArray(target.readyCallbacks)) {
    return;
  }

  target.readyCallbacks = [];
  if (target.__readyCallbacksFlushScheduled) {
    return;
  }
  target.__readyCallbacksFlushScheduled = true;

  Promise.resolve().then(() => {
    const callbacks = target.readyCallbacks;
    target.__readyCallbacksFlushScheduled = false;
    if (!Array.isArray(callbacks)) {
      return;
    }
    callbacks.forEach((callback) => callback(texture));
    delete target.readyCallbacks;
  });
}

function collectMaterialTextures(material: THREE.Material): Set<THREE.Texture> {
  const textures = new Set<THREE.Texture>();
  const maybeRecord = material as unknown as Record<string, unknown>;

  Object.values(maybeRecord).forEach((value) => {
    pushTextureIfPresent(value, textures);
  });

  const maybeUniforms = (material as THREE.ShaderMaterial).uniforms;
  if (maybeUniforms) {
    Object.values(maybeUniforms).forEach((uniformValue) => {
      const value = (uniformValue as { value?: unknown } | undefined)?.value;
      pushTextureIfPresent(value, textures);
    });
  }

  return textures;
}

function collectMeshTextures(mesh: THREE.SkinnedMesh): Set<THREE.Texture> {
  const textures = new Set<THREE.Texture>();
  mesh.traverse((child) => {
    const object = child as THREE.Mesh;
    const material = object.material;
    if (!material) {
      return;
    }
    if (Array.isArray(material)) {
      material.forEach((entry) => {
        collectMaterialTextures(entry).forEach((texture) => textures.add(texture));
      });
      return;
    }
    collectMaterialTextures(material).forEach((texture) => textures.add(texture));
  });
  return textures;
}

function isTextureImageReady(texture: THREE.Texture): boolean {
  const textureRecord = texture as unknown as { image?: unknown; source?: { data?: unknown } };
  const image = textureRecord.image ?? textureRecord.source?.data;
  if (!image) {
    return false;
  }

  const maybeImage = image as {
    complete?: boolean;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
    data?: unknown;
  };

  if (typeof maybeImage.complete === 'boolean') {
    if (!maybeImage.complete) {
      return false;
    }
    if (typeof maybeImage.naturalWidth === 'number') {
      return maybeImage.naturalWidth > 0;
    }
    return true;
  }

  if (typeof maybeImage.width === 'number' && typeof maybeImage.height === 'number') {
    return maybeImage.width > 0 && maybeImage.height > 0;
  }

  if (maybeImage.data) {
    return true;
  }

  return true;
}

function waitTextureReady(texture: THREE.Texture, timeoutMs: number): Promise<boolean> {
  if (isTextureImageReady(texture)) {
    return Promise.resolve(false);
  }

  const textureWithCallbacks = texture as TextureWithReadyCallbacks;
  if (Array.isArray(textureWithCallbacks.readyCallbacks)) {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timeoutId = globalThis.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(true);
      }, timeoutMs);

      textureWithCallbacks.readyCallbacks?.push(() => {
        if (settled) {
          return;
        }
        settled = true;
        globalThis.clearTimeout(timeoutId);
        resolve(false);
      });
    });
  }

  return Promise.resolve(false);
}

class MMDTextureCache {
  private readonly entries = new Map<string, TextureCacheEntry>();
  private readonly textureToKey = new WeakMap<THREE.Texture, string>();

  constructor(private maxSize = 80) {}

  setMaxSize(maxSize: number): void {
    const safeSize = Math.max(1, Math.floor(maxSize));
    this.maxSize = safeSize;
    this.evictUnused();
  }

  getStats(): TextureCacheStats {
    let activeRefs = 0;
    this.entries.forEach((entry) => {
      activeRefs += entry.refCount;
    });
    return {
      size: this.entries.size,
      maxSize: this.maxSize,
      activeRefs,
    };
  }

  get(key: string): THREE.Texture | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    entry.lastUsedAt = Date.now();
    return entry.texture;
  }

  set(key: string, texture: THREE.Texture): THREE.Texture {
    const existing = this.entries.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      if (existing.texture !== texture) {
        texture.dispose();
      }
      this.textureToKey.set(existing.texture, key);
      return existing.texture;
    }

    const entry: TextureCacheEntry = {
      key,
      texture,
      refCount: 0,
      lastUsedAt: Date.now(),
    };
    this.entries.set(key, entry);
    this.textureToKey.set(texture, key);
    this.evictUnused();
    return texture;
  }

  hasTexture(texture: THREE.Texture): boolean {
    const key = this.textureToKey.get(texture);
    if (!key) {
      return false;
    }
    const entry = this.entries.get(key);
    return entry?.texture === texture;
  }

  retainTexture(texture: THREE.Texture): void {
    const key = this.textureToKey.get(texture);
    if (!key) {
      return;
    }
    const entry = this.entries.get(key);
    if (!entry || entry.texture !== texture) {
      return;
    }
    entry.refCount += 1;
    entry.lastUsedAt = Date.now();
  }

  releaseTexture(texture: THREE.Texture): void {
    const key = this.textureToKey.get(texture);
    if (!key) {
      return;
    }
    const entry = this.entries.get(key);
    if (!entry || entry.texture !== texture) {
      return;
    }
    entry.refCount = Math.max(0, entry.refCount - 1);
    entry.lastUsedAt = Date.now();
    this.evictUnused();
  }

  retainMeshTextures(mesh: THREE.SkinnedMesh): void {
    collectMeshTextures(mesh).forEach((texture) => this.retainTexture(texture));
  }

  releaseMeshTextures(mesh: THREE.SkinnedMesh): void {
    collectMeshTextures(mesh).forEach((texture) => this.releaseTexture(texture));
  }

  clear(force = false): void {
    if (force) {
      this.entries.forEach((entry) => entry.texture.dispose());
      this.entries.clear();
      return;
    }

    const keysToDelete: string[] = [];
    this.entries.forEach((entry, key) => {
      if (entry.refCount === 0) {
        entry.texture.dispose();
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.entries.delete(key));
  }

  private evictUnused(): void {
    if (this.entries.size <= this.maxSize) {
      return;
    }

    while (this.entries.size > this.maxSize) {
      let candidate: TextureCacheEntry | null = null;
      for (const entry of this.entries.values()) {
        if (entry.refCount > 0) {
          continue;
        }
        if (!candidate || entry.lastUsedAt < candidate.lastUsedAt) {
          candidate = entry;
        }
      }

      if (!candidate) {
        break;
      }

      candidate.texture.dispose();
      this.entries.delete(candidate.key);
    }
  }
}

const sharedTextureCache = new MMDTextureCache();

function patchTextureLoaderWithSharedCache(
  loader: MMDLoader,
  enabled: boolean,
  preferWebpTextures: boolean
): void {
  if (!enabled && !preferWebpTextures) {
    return;
  }

  const mmdLoader = loader as MMDLoaderWithMaterialBuilder;
  const materialBuilder = mmdLoader.meshBuilder?.materialBuilder;
  if (!materialBuilder) {
    return;
  }

  if (materialBuilder.__sharedTextureCachePatched) {
    return;
  }

  if (typeof materialBuilder._loadTexture !== 'function') {
    return;
  }

  const originalLoadTexture = materialBuilder._loadTexture.bind(materialBuilder);
  materialBuilder._loadTexture = (filePath, textures, params, onProgress, onError) => {
    const normalizedTexturePath = normalizeMmdTexturePath(filePath) || filePath;
    const resolvedTexturePath = resolveMmdTextureRequestPath(
      normalizedTexturePath,
      params,
      preferWebpTextures
    );
    if (
      DEBUG_MMD_WEBP &&
      resolvedTexturePath !== normalizedTexturePath &&
      debugWebpRewriteLogCount < 24
    ) {
      debugWebpRewriteLogCount += 1;
      console.info('[mmd-webp] rewrite texture path', {
        from: normalizedTexturePath,
        to: resolvedTexturePath,
      });
    }
    if (!enabled) {
      return originalLoadTexture(
        resolvedTexturePath,
        textures,
        params,
        onProgress,
        onError
      );
    }

    const cacheKey = buildTextureCacheKey(
      materialBuilder.resourcePath ?? mmdLoader.resourcePath ?? '',
      resolvedTexturePath,
      params
    );
    const cached = sharedTextureCache.get(cacheKey);
    if (cached) {
      ensureReadyCallbacksQueue(cached);
      return cached;
    }

    const loaded = originalLoadTexture(
      resolvedTexturePath,
      textures,
      params,
      onProgress,
      onError
    );
    return sharedTextureCache.set(cacheKey, loaded);
  };
  materialBuilder.__sharedTextureCachePatched = true;
}

function createLoader(modelUrl: string, options?: MMDLoadOptions): MMDLoader {
  const loader = new MMDLoader();
  loader.setResourcePath(options?.resourcePath ?? toDirectoryUrl(modelUrl));
  patchTextureLoaderWithSharedCache(
    loader,
    options?.useTextureCache !== false,
    options?.preferWebpTextures !== false
  );
  if (options?.textureCacheMaxSize) {
    sharedTextureCache.setMaxSize(options.textureCacheMaxSize);
  }
  return loader;
}

function findSkinnedMesh(object: THREE.Object3D): THREE.SkinnedMesh {
  if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
    return object as THREE.SkinnedMesh;
  }

  let result: THREE.SkinnedMesh | null = null;
  object.traverse((child) => {
    if (!result && (child as THREE.SkinnedMesh).isSkinnedMesh) {
      result = child as THREE.SkinnedMesh;
    }
  });

  if (!result) {
    throw new Error('PMX 加载结果不包含 SkinnedMesh');
  }

  return result;
}

export function loadPMX(modelUrl: string, options?: MMDLoadOptions): Promise<THREE.SkinnedMesh> {
  const encodedUrl = toEncodedUrl(modelUrl);
  const loader = createLoader(modelUrl, options);

  return new Promise<THREE.SkinnedMesh>((resolve, reject) => {
    loader.load(
      encodedUrl,
      (object: THREE.Object3D) => {
        try {
          const mesh = findSkinnedMesh(object);
          if (options?.useTextureCache !== false) {
            sharedTextureCache.retainMeshTextures(mesh);
          }
          resolve(mesh);
        } catch (error) {
          const normalizedError = normalizeError(error);
          options?.onError?.(normalizedError);
          reject(normalizedError);
        }
      },
      (event: ProgressEvent<EventTarget>) => options?.onProgress?.(toProgressPercent(event)),
      (error: unknown) => {
        const normalizedError = normalizeError(error);
        options?.onError?.(normalizedError);
        reject(normalizedError);
      }
    );
  });
}

export function disposeMMDMesh(mesh: THREE.SkinnedMesh | null | undefined): void {
  if (!mesh) {
    return;
  }

  const textures = collectMeshTextures(mesh);
  sharedTextureCache.releaseMeshTextures(mesh);

  mesh.traverse((child) => {
    const object = child as THREE.Mesh;
    object.geometry?.dispose();
    const material = object.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });

  textures.forEach((texture) => {
    if (!sharedTextureCache.hasTexture(texture)) {
      texture.dispose();
    }
  });

  mesh.removeFromParent();
  mesh.clear();
}

export function getMMDTextureCacheStats(): TextureCacheStats {
  return sharedTextureCache.getStats();
}

export function clearMMDTextureCache(force = false): void {
  sharedTextureCache.clear(force);
}

export async function waitForMMDMeshTexturesReady(
  mesh: THREE.SkinnedMesh,
  options?: WaitTextureReadyOptions
): Promise<WaitTextureReadyResult> {
  const timeoutMs = Math.max(100, Math.floor(options?.timeoutMs ?? 12000));
  const textures = Array.from(collectMeshTextures(mesh));
  const pendingTextures = textures.filter((texture) => !isTextureImageReady(texture));

  if (pendingTextures.length === 0) {
    return {
      total: textures.length,
      pending: 0,
      timedOut: false,
    };
  }

  const results = await Promise.all(
    pendingTextures.map((texture) => waitTextureReady(texture, timeoutMs))
  );

  return {
    total: textures.length,
    pending: pendingTextures.length,
    timedOut: results.some(Boolean),
  };
}

export function loadVMDAnimation(
  vmdUrls: string | string[],
  mesh: THREE.SkinnedMesh,
  options?: MMDLoadOptions
): Promise<THREE.AnimationClip> {
  const firstUrl = Array.isArray(vmdUrls) ? vmdUrls[0] : vmdUrls;
  const loader = createLoader(firstUrl, options);
  const encodedVmdUrl = Array.isArray(vmdUrls)
    ? vmdUrls.map((url) => toEncodedUrl(url))
    : toEncodedUrl(vmdUrls);

  return new Promise<THREE.AnimationClip>((resolve, reject) => {
    loader.loadAnimation(
      encodedVmdUrl,
      mesh,
      (animation: THREE.AnimationClip | THREE.AnimationClip[]) => {
        const clip = Array.isArray(animation) ? animation[0] : animation;
        if (!clip) {
          const error = new Error('VMD 动画解析结果为空');
          options?.onError?.(error);
          reject(error);
          return;
        }
        resolve(clip);
      },
      (event: ProgressEvent<EventTarget>) => options?.onProgress?.(toProgressPercent(event)),
      (error: unknown) => {
        const normalizedError = normalizeError(error);
        options?.onError?.(normalizedError);
        reject(normalizedError);
      }
    );
  });
}

export async function loadWithAnimation(
  modelUrl: string,
  vmdUrls: string | string[],
  options?: MMDLoadOptions
): Promise<MMDModelWithAnimation> {
  const mesh = await loadPMX(modelUrl, options);
  const clip = await loadVMDAnimation(vmdUrls, mesh, options);
  return { mesh, clip };
}

import * as THREE from 'three';
import { MMDLoader } from '@/lib/vendor/mmd/MMDLoader.js';

export interface MMDLoadOptions {
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  resourcePath?: string;
  useTextureCache?: boolean;
  textureCacheMaxSize?: number;
}

export interface MMDModelWithAnimation {
  mesh: THREE.SkinnedMesh;
  clip: THREE.AnimationClip;
}

type MMDLoaderWithTextureHook = MMDLoader & {
  _loadTexture?: (
    filePath: string,
    textures: Record<string, THREE.Texture>,
    params?: unknown,
    onProgress?: (event: ProgressEvent<EventTarget>) => void,
    onError?: (error: unknown) => void
  ) => THREE.Texture;
  resourcePath?: string;
  __sharedTextureCachePatched?: boolean;
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

function buildTextureCacheKey(resourcePath: string, filePath: string, params?: unknown): string {
  const normalizedFilePath = normalizePath(filePath.trim());
  const options = params as { isDefaultToonTexture?: boolean } | undefined;
  if (options?.isDefaultToonTexture) {
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

function patchTextureLoaderWithSharedCache(loader: MMDLoader, enabled: boolean): void {
  if (!enabled) {
    return;
  }

  const mmdLoader = loader as MMDLoaderWithTextureHook;
  if (mmdLoader.__sharedTextureCachePatched) {
    return;
  }

  if (typeof mmdLoader._loadTexture !== 'function') {
    return;
  }

  const originalLoadTexture = mmdLoader._loadTexture.bind(loader);
  mmdLoader._loadTexture = (filePath, textures, params, onProgress, onError) => {
    const normalizedTexturePath = normalizeMmdTexturePath(filePath) || filePath;
    const cacheKey = buildTextureCacheKey(
      mmdLoader.resourcePath ?? '',
      normalizedTexturePath,
      params
    );
    const cached = sharedTextureCache.get(cacheKey);
    if (cached) {
      ensureReadyCallbacksQueue(cached);
      return cached;
    }

    const loaded = originalLoadTexture(
      normalizedTexturePath,
      textures,
      params,
      onProgress,
      onError
    );
    return sharedTextureCache.set(cacheKey, loaded);
  };
  mmdLoader.__sharedTextureCachePatched = true;
}

function createLoader(modelUrl: string, options?: MMDLoadOptions): MMDLoader {
  const loader = new MMDLoader();
  loader.setResourcePath(options?.resourcePath ?? toDirectoryUrl(modelUrl));
  patchTextureLoaderWithSharedCache(loader, options?.useTextureCache !== false);
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

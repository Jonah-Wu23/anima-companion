import * as THREE from 'three';
import { MMDLoader } from 'three/examples/jsm/loaders/MMDLoader.js';

export interface MMDLoadOptions {
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  resourcePath?: string;
}

export interface MMDModelWithAnimation {
  mesh: THREE.SkinnedMesh;
  clip: THREE.AnimationClip;
}

function toEncodedUrl(url: string): string {
  return encodeURI(url.trim());
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

function createLoader(modelUrl: string, options?: MMDLoadOptions): MMDLoader {
  const loader = new MMDLoader();
  loader.setResourcePath(options?.resourcePath ?? toDirectoryUrl(modelUrl));
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

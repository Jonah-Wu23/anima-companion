import * as THREE from 'three';

export class MotionCache {
  private readonly cache = new Map<string, THREE.AnimationClip>();

  constructor(private readonly maxSize = 12) {}

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get(key: string): THREE.AnimationClip | undefined {
    const value = this.cache.get(key);
    if (!value) {
      return undefined;
    }

    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: string, value: THREE.AnimationClip): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    this.evictIfNeeded();
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxSize) {
      const lruKey = this.cache.keys().next().value;
      if (!lruKey) {
        break;
      }
      this.cache.delete(lruKey);
    }
  }
}

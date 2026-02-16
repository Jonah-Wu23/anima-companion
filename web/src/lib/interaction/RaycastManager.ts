import * as THREE from 'three';
import type { InteractionType } from '@/lib/interaction/TouchInteractionProvider';

const RECT_CACHE_TTL_MS = 120;

export interface RaycastZoneConfig {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  allowedInteractions: InteractionType[];
  size: THREE.Vector3;
  getCenterWorld: (target: THREE.Vector3) => THREE.Vector3;
  getPreciseTargets?: () => THREE.Object3D[];
}

export interface RaycastHitResult {
  zoneId: string;
  zoneName: string;
  distance: number;
  point: THREE.Vector3;
  pointerNdc: THREE.Vector2;
  pointerNormalized: { x: number; y: number };
}

interface RaycastZoneRuntime {
  config: RaycastZoneConfig;
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  box: THREE.Box3;
}

interface RaycastContext {
  camera: THREE.Camera;
  domElement: HTMLElement;
}

interface CachedRect {
  rect: DOMRect;
  ts: number;
}

interface CachedFrameResult {
  frameToken: number;
  clientX: number;
  clientY: number;
  interactionType: InteractionType | null;
  result: RaycastHitResult | null;
}

export class RaycastManager {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly tmpCenter = new THREE.Vector3();
  private readonly tmpHalf = new THREE.Vector3();
  private readonly tmpPoint = new THREE.Vector3();
  private readonly zones = new Map<string, RaycastZoneRuntime>();

  private context: RaycastContext | null = null;
  private frameToken = 0;
  private rectCache: CachedRect | null = null;
  private frameCache: CachedFrameResult = {
    frameToken: -1,
    clientX: Number.NaN,
    clientY: Number.NaN,
    interactionType: null,
    result: null,
  };

  setContext(camera: THREE.Camera, domElement: HTMLElement): void {
    this.context = { camera, domElement };
    this.rectCache = null;
    this.frameCache = {
      frameToken: -1,
      clientX: Number.NaN,
      clientY: Number.NaN,
      interactionType: null,
      result: null,
    };
  }

  setFrameToken(frameToken: number): void {
    this.frameToken = frameToken;
  }

  registerZone(zone: RaycastZoneConfig): void {
    const runtime: RaycastZoneRuntime = {
      config: zone,
      center: new THREE.Vector3(),
      halfSize: zone.size.clone().multiplyScalar(0.5),
      box: new THREE.Box3(),
    };
    this.zones.set(zone.id, runtime);
    this.updateZoneBounds(runtime);
  }

  unregisterZone(zoneId: string): void {
    this.zones.delete(zoneId);
  }

  getZoneBoundsSnapshot(zoneId: string): { center: THREE.Vector3; size: THREE.Vector3 } | null {
    const runtime = this.zones.get(zoneId);
    if (!runtime) {
      return null;
    }
    this.updateZoneBounds(runtime);
    return {
      center: runtime.center.clone(),
      size: runtime.config.size.clone(),
    };
  }

  getAllZoneBoundsSnapshot(): Array<{
    id: string;
    name: string;
    priority: number;
    enabled: boolean;
    allowedInteractions: InteractionType[];
    center: THREE.Vector3;
    size: THREE.Vector3;
  }> {
    const snapshots: Array<{
      id: string;
      name: string;
      priority: number;
      enabled: boolean;
      allowedInteractions: InteractionType[];
      center: THREE.Vector3;
      size: THREE.Vector3;
    }> = [];
    this.zones.forEach((runtime) => {
      this.updateZoneBounds(runtime);
      snapshots.push({
        id: runtime.config.id,
        name: runtime.config.name,
        priority: runtime.config.priority,
        enabled: runtime.config.enabled,
        allowedInteractions: runtime.config.allowedInteractions,
        center: runtime.center.clone(),
        size: runtime.config.size.clone(),
      });
    });
    snapshots.sort((a, b) => b.priority - a.priority);
    return snapshots;
  }

  raycastFromScreen(
    clientX: number,
    clientY: number,
    interactionType: InteractionType
  ): RaycastHitResult | null {
    if (!this.context) {
      return null;
    }

    if (
      this.frameCache.frameToken === this.frameToken &&
      this.frameCache.clientX === clientX &&
      this.frameCache.clientY === clientY &&
      this.frameCache.interactionType === interactionType
    ) {
      return this.frameCache.result;
    }

    const rect = this.getDomRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      this.frameCache = {
        frameToken: this.frameToken,
        clientX,
        clientY,
        interactionType,
        result: null,
      };
      return null;
    }

    const normalizedX = (clientX - rect.left) / rect.width;
    const normalizedY = (clientY - rect.top) / rect.height;
    this.pointerNdc.set(normalizedX * 2 - 1, -(normalizedY * 2 - 1));
    this.raycaster.setFromCamera(this.pointerNdc, this.context.camera);

    const candidates: Array<{
      runtime: RaycastZoneRuntime;
      distance: number;
      point: THREE.Vector3;
    }> = [];

    this.zones.forEach((runtime) => {
      if (!runtime.config.enabled) {
        return;
      }
      if (!runtime.config.allowedInteractions.includes(interactionType)) {
        return;
      }

      this.updateZoneBounds(runtime);
      if (!this.raycaster.ray.intersectsBox(runtime.box)) {
        return;
      }

      let hitDistance = Number.POSITIVE_INFINITY;
      let hitPoint: THREE.Vector3 | null = null;

      const preciseTargets = runtime.config.getPreciseTargets?.() ?? [];
      if (preciseTargets.length > 0) {
        const intersections = this.raycaster.intersectObjects(preciseTargets, true);
        if (intersections.length > 0) {
          hitDistance = intersections[0].distance;
          hitPoint = intersections[0].point.clone();
        }
      }

      if (!hitPoint) {
        const rayPoint = this.raycaster.ray.intersectBox(runtime.box, this.tmpPoint);
        if (!rayPoint) {
          return;
        }
        hitPoint = rayPoint.clone();
        hitDistance = this.raycaster.ray.origin.distanceTo(hitPoint);
      }

      candidates.push({
        runtime,
        distance: hitDistance,
        point: hitPoint,
      });
    });

    if (candidates.length === 0) {
      this.frameCache = {
        frameToken: this.frameToken,
        clientX,
        clientY,
        interactionType,
        result: null,
      };
      return null;
    }

    candidates.sort((a, b) => {
      if (a.runtime.config.priority !== b.runtime.config.priority) {
        return b.runtime.config.priority - a.runtime.config.priority;
      }
      return a.distance - b.distance;
    });

    const top = candidates[0];
    const result: RaycastHitResult = {
      zoneId: top.runtime.config.id,
      zoneName: top.runtime.config.name,
      distance: top.distance,
      point: top.point,
      pointerNdc: this.pointerNdc.clone(),
      pointerNormalized: { x: normalizedX, y: normalizedY },
    };

    this.frameCache = {
      frameToken: this.frameToken,
      clientX,
      clientY,
      interactionType,
      result,
    };
    return result;
  }

  dispose(): void {
    this.zones.clear();
    this.context = null;
    this.rectCache = null;
    this.frameCache = {
      frameToken: -1,
      clientX: Number.NaN,
      clientY: Number.NaN,
      interactionType: null,
      result: null,
    };
  }

  private updateZoneBounds(runtime: RaycastZoneRuntime): void {
    runtime.config.getCenterWorld(this.tmpCenter);
    runtime.center.copy(this.tmpCenter);
    this.tmpHalf.copy(runtime.halfSize);
    runtime.box.min.copy(runtime.center).sub(this.tmpHalf);
    runtime.box.max.copy(runtime.center).add(this.tmpHalf);
  }

  private getDomRect(): DOMRect {
    const context = this.context;
    if (!context) {
      return new DOMRect(0, 0, 1, 1);
    }
    const now = performance.now();
    if (!this.rectCache || now - this.rectCache.ts > RECT_CACHE_TTL_MS) {
      this.rectCache = {
        rect: context.domElement.getBoundingClientRect(),
        ts: now,
      };
    }
    return this.rectCache.rect;
  }
}

import * as THREE from 'three';
import { MMDAnimationHelper } from '@/lib/vendor/mmd/MMDAnimationHelper.js';
import { LipSyncController, type LipSyncMorphs } from '@/lib/mmd/lipsync';

interface ClipPlaybackOptions {
  loop?: boolean;
  clampWhenFinished?: boolean;
}

interface MMDAnimationManagerOptions {
  fadeDuration?: number;
  lipSyncMorphs?: LipSyncMorphs;
  usePhysics?: boolean;
}

interface AnimationActionSnapshot {
  name: string;
  time: number;
  weight: number;
  enabled: boolean;
  loop: THREE.AnimationActionLoopStyles;
  clampWhenFinished: boolean;
  paused: boolean;
}

export interface AnimationSnapshot {
  currentActionName: string | null;
  actions: AnimationActionSnapshot[];
}

type HelperObject = {
  mixer?: THREE.AnimationMixer;
};

export class MMDAnimationManager {
  private readonly helper = new MMDAnimationHelper({ afterglow: 1.0 });
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly clipOptions = new Map<string, ClipPlaybackOptions>();
  private readonly lipSync: LipSyncController;
  private readonly mixer: THREE.AnimationMixer;
  private currentActionName: string | null = null;
  private disposed = false;

  constructor(
    private readonly mesh: THREE.SkinnedMesh,
    private readonly options: MMDAnimationManagerOptions = {}
  ) {
    this.helper.add(mesh, { physics: options.usePhysics ?? false });

    const helperObjects = (this.helper as unknown as { objects: WeakMap<THREE.SkinnedMesh, HelperObject> }).objects;
    const helperObject = helperObjects.get(mesh);
    if (!helperObject) {
      throw new Error('MMDAnimationHelper 初始化失败：对象未注册');
    }

    // MMDAnimationHelper 仅在传入 animation 参数时才会自动创建 mixer。
    // 当前流程先注册 clip 后播放，因此这里兜底创建 mixer。
    helperObject.mixer ??= new THREE.AnimationMixer(mesh);
    this.mixer = helperObject.mixer;
    this.lipSync = new LipSyncController(mesh, options.lipSyncMorphs);
  }

  registerClip(name: string, clip: THREE.AnimationClip, options?: ClipPlaybackOptions): void {
    this.clips.set(name, clip);
    this.clipOptions.set(name, {
      loop: options?.loop ?? true,
      clampWhenFinished: options?.clampWhenFinished,
    });
  }

  play(name: string, fadeDuration = this.options.fadeDuration ?? 0.35): void {
    const clip = this.clips.get(name);
    if (!clip) {
      return;
    }

    const nextAction = this.getAction(name, clip);
    const currentAction = this.currentActionName ? this.actions.get(this.currentActionName) : undefined;
    const clipOption = this.clipOptions.get(name);

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.setEffectiveTimeScale(1);
    nextAction.loop = clipOption?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat;
    nextAction.clampWhenFinished = clipOption?.clampWhenFinished ?? clipOption?.loop === false;

    if (currentAction && currentAction !== nextAction) {
      currentAction.crossFadeTo(nextAction, fadeDuration, false);
    } else {
      nextAction.fadeIn(fadeDuration);
    }

    nextAction.play();
    this.currentActionName = name;
  }

  stop(name?: string): void {
    if (name) {
      this.actions.get(name)?.stop();
      if (this.currentActionName === name) {
        this.currentActionName = null;
      }
      return;
    }

    this.actions.forEach((action) => action.stop());
    this.currentActionName = null;
  }

  update(delta: number): void {
    this.helper.update(delta);
    this.lipSync.update(delta);
  }

  setLipSync(energy: number, morphs?: LipSyncMorphs): void {
    if (morphs) {
      this.lipSync.setMorphs(morphs);
    }
    this.lipSync.setEnergy(energy);
  }

  captureSnapshot(): AnimationSnapshot {
    const actions: AnimationActionSnapshot[] = [];
    this.actions.forEach((action, name) => {
      actions.push({
        name,
        time: action.time,
        weight: action.getEffectiveWeight(),
        enabled: action.enabled,
        loop: action.loop,
        clampWhenFinished: action.clampWhenFinished,
        paused: action.paused,
      });
    });

    return {
      currentActionName: this.currentActionName,
      actions,
    };
  }

  restoreSnapshot(snapshot: AnimationSnapshot | null, fadeDuration = 0): void {
    if (!snapshot) {
      return;
    }

    if (snapshot.currentActionName && this.clips.has(snapshot.currentActionName)) {
      this.play(snapshot.currentActionName, fadeDuration);
    }

    snapshot.actions.forEach((entry) => {
      const clip = this.clips.get(entry.name);
      if (!clip) {
        return;
      }

      const action = this.getAction(entry.name, clip);
      action.enabled = entry.enabled;
      action.loop = entry.loop;
      action.clampWhenFinished = entry.clampWhenFinished;
      action.paused = entry.paused;
      action.setEffectiveWeight(entry.weight);

      if (clip.duration > 0) {
        action.time = THREE.MathUtils.euclideanModulo(entry.time, clip.duration);
      } else {
        action.time = Math.max(0, entry.time);
      }

      if (entry.weight > 0 || entry.name === snapshot.currentActionName) {
        action.play();
      }
    });

    if (snapshot.currentActionName && this.clips.has(snapshot.currentActionName)) {
      this.currentActionName = snapshot.currentActionName;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.stop();
    this.actions.clear();
    this.clips.clear();
    this.clipOptions.clear();
    this.lipSync.reset(true);

    const helperObjects = (this.helper as unknown as { objects?: WeakMap<THREE.SkinnedMesh, HelperObject> }).objects;
    if (helperObjects?.has(this.mesh)) {
      this.helper.remove(this.mesh);
    }
  }

  getCurrentActionName(): string | null {
    return this.currentActionName;
  }

  private getAction(name: string, clip: THREE.AnimationClip): THREE.AnimationAction {
    const existing = this.actions.get(name);
    if (existing) {
      return existing;
    }

    const created = this.mixer.clipAction(clip, this.mesh);
    this.actions.set(name, created);
    return created;
  }
}

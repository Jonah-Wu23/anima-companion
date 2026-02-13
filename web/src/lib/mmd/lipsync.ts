import * as THREE from 'three';

export interface LipSyncMorphs {
  a?: string;
  i?: string;
  u?: string;
  e?: string;
  o?: string;
}

const DEFAULT_LIP_MORPHS: Required<LipSyncMorphs> = {
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
};

function getTargetWeight(energy: number): number {
  const clamped = THREE.MathUtils.clamp(energy, 0, 1);
  if (clamped < 0.1) return 0;
  if (clamped < 0.3) return 0.3;
  if (clamped < 0.6) return 0.6;
  return 1;
}

export class LipSyncController {
  private morphs: Required<LipSyncMorphs>;
  private morphIndices: Partial<Record<keyof LipSyncMorphs, number>> = {};
  private targetWeight = 0;
  private currentWeight = 0;

  constructor(
    private readonly mesh: THREE.SkinnedMesh,
    morphs?: LipSyncMorphs,
    private readonly smoothing = 0.2
  ) {
    this.morphs = { ...DEFAULT_LIP_MORPHS, ...morphs };
    this.resolveMorphIndices();
  }

  setMorphs(morphs: LipSyncMorphs): void {
    this.morphs = { ...this.morphs, ...morphs };
    this.resolveMorphIndices();
  }

  setEnergy(energy: number): void {
    this.targetWeight = getTargetWeight(energy);
  }

  update(delta = 1 / 60): void {
    const influences = this.mesh.morphTargetInfluences;
    if (!influences) {
      return;
    }

    const interpolation = 1 - Math.pow(1 - this.smoothing, Math.max(1, delta * 60));
    this.currentWeight = THREE.MathUtils.lerp(this.currentWeight, this.targetWeight, interpolation);
    this.applyWeight(this.currentWeight);
  }

  reset(immediate = false): void {
    this.targetWeight = 0;
    if (immediate) {
      this.currentWeight = 0;
      this.applyWeight(0);
    }
  }

  private resolveMorphIndices(): void {
    this.morphIndices = {};
    const dictionary = this.mesh.morphTargetDictionary;
    if (!dictionary) {
      return;
    }

    (Object.keys(this.morphs) as Array<keyof LipSyncMorphs>).forEach((key) => {
      const morphName = this.morphs[key];
      if (!morphName) {
        return;
      }
      const index = dictionary[morphName];
      if (index !== undefined) {
        this.morphIndices[key] = index;
      }
    });
  }

  private applyWeight(weight: number): void {
    const influences = this.mesh.morphTargetInfluences;
    if (!influences) {
      return;
    }

    const primaryIndex =
      this.morphIndices.a ??
      this.morphIndices.i ??
      this.morphIndices.u ??
      this.morphIndices.e ??
      this.morphIndices.o;

    if (primaryIndex === undefined) {
      return;
    }

    influences[primaryIndex] = weight;
    const secondaryScale = 0.15;
    if (this.morphIndices.i !== undefined && this.morphIndices.i !== primaryIndex) {
      influences[this.morphIndices.i] = weight * secondaryScale;
    }
    if (this.morphIndices.u !== undefined && this.morphIndices.u !== primaryIndex) {
      influences[this.morphIndices.u] = weight * secondaryScale;
    }
    if (this.morphIndices.e !== undefined && this.morphIndices.e !== primaryIndex) {
      influences[this.morphIndices.e] = weight * secondaryScale;
    }
    if (this.morphIndices.o !== undefined && this.morphIndices.o !== primaryIndex) {
      influences[this.morphIndices.o] = weight * secondaryScale;
    }
  }
}

export { DEFAULT_LIP_MORPHS };

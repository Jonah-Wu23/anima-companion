declare module '@/lib/vendor/mmd/MMDLoader.js' {
  import * as THREE from 'three';

  export class MMDLoader extends THREE.Loader {
    load(
      url: string,
      onLoad: (object: THREE.Object3D) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (event: unknown) => void
    ): void;

    loadAnimation(
      url: string | string[],
      object: THREE.Object3D,
      onLoad: (animation: THREE.AnimationClip | THREE.AnimationClip[]) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (event: unknown) => void
    ): void;
  }
}

declare module '@/lib/vendor/mmd/MMDAnimationHelper.js' {
  import * as THREE from 'three';

  interface HelperOptions {
    afterglow?: number;
    resetPhysicsOnLoop?: boolean;
  }

  interface AddOptions {
    animation?: THREE.AnimationClip | THREE.AnimationClip[];
    physics?: boolean;
  }

  export class MMDAnimationHelper {
    constructor(params?: HelperOptions);
    add(object: THREE.Object3D, params?: AddOptions): void;
    remove(object: THREE.Object3D): void;
    update(delta: number): void;
  }
}

declare module 'three/examples/jsm/libs/ammo.wasm.js' {
  const AmmoFactory: () => Promise<unknown>;
  export default AmmoFactory;
}

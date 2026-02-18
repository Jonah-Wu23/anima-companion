let ammoLoadingPromise: Promise<void> | null = null;
let ammoScriptPromise: Promise<void> | null = null;

const AMMO_SCRIPT_ID = 'ammo-wasm-script';
const AMMO_BASE_URL = '/api/local-files/assets/vendor';
const AMMO_SCRIPT_URL = `${AMMO_BASE_URL}/ammo.wasm.js`;

type AmmoFactory = (config?: { locateFile?: (path: string) => string }) => Promise<unknown>;
type AmmoRuntime = { btVector3?: unknown };

function isAmmoRuntime(value: unknown): value is AmmoRuntime {
  return !!value && typeof value === 'object' && typeof (value as AmmoRuntime).btVector3 === 'function';
}

function isAmmoFactory(value: unknown): value is AmmoFactory {
  return typeof value === 'function';
}

function loadAmmoScript(): Promise<void> {
  if (ammoScriptPromise) {
    return ammoScriptPromise;
  }
  ammoScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(AMMO_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing ?? document.createElement('script');
    script.id = AMMO_SCRIPT_ID;
    script.src = AMMO_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      ammoScriptPromise = null;
      reject(new Error(`Ammo 脚本加载失败: ${AMMO_SCRIPT_URL}`));
    };
    if (!existing) {
      document.head.appendChild(script);
    }
  });
  return ammoScriptPromise;
}

export async function ensureAmmoLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const scope = window as Window & { Ammo?: unknown };
  if (isAmmoRuntime(scope.Ammo)) {
    return;
  }

  if (!ammoLoadingPromise) {
    ammoLoadingPromise = (async () => {
      await loadAmmoScript();
      const maybeFactory = scope.Ammo;
      if (!isAmmoFactory(maybeFactory) && !isAmmoRuntime(maybeFactory)) {
        throw new Error('Ammo 工厂函数未找到');
      }
      if (isAmmoRuntime(maybeFactory)) {
        return;
      }

      const runtime = await maybeFactory({
        locateFile: (path: string) => `${AMMO_BASE_URL}/${path}`,
      });
      const resolvedRuntime = isAmmoRuntime(runtime) ? runtime : scope.Ammo;
      if (!isAmmoRuntime(resolvedRuntime)) {
        throw new Error('Ammo 运行时初始化失败');
      }
      scope.Ammo = resolvedRuntime;
    })().catch((error) => {
      ammoLoadingPromise = null;
      throw error;
    });
  }

  await ammoLoadingPromise;
}

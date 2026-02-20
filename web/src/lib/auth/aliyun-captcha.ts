const CAPTCHA_SCRIPT_SRC =
  "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js";

type CaptchaScene = "login" | "register" | "sms";

type CaptchaSuccess = (captchaVerifyParam: unknown) => void;
type CaptchaFail = (result: unknown) => void;

type CaptchaInitOptions = {
  SceneId: string;
  mode: "popup" | "embed";
  element: string;
  button: string;
  success: CaptchaSuccess;
  fail?: CaptchaFail;
  getInstance: (instance: AliyunCaptchaInstance) => void;
  language?: "cn" | "en";
  delayBeforeSuccess?: boolean;
  onError?: (error: { code?: string; msg?: string }) => void;
  onClose?: () => void;
};

type AliyunCaptchaInstance = {
  show?: () => void;
  startTracelessVerification?: () => void;
};

declare global {
  interface Window {
    AliyunCaptchaConfig?: {
      region: "cn" | "sgp";
      prefix: string;
    };
    initAliyunCaptcha?: (options: CaptchaInitOptions) => void;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function shouldIgnoreCaptchaConsoleNoise(args: unknown[]): boolean {
  const joinedText = args
    .filter((item): item is string => typeof item === "string")
    .join(" ");
  if (joinedText.includes("font-size:0;color:transparent")) {
    return true;
  }
  if (joinedText.includes("puzzleEventData")) {
    return true;
  }
  return false;
}

function installCaptchaConsoleNoiseFilter(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const methodNames = [
    "error",
    "warn",
    "info",
    "log",
    "clear",
    "count",
    "countReset",
    "dir",
    "dirxml",
    "table",
  ] as const;
  const consoleRecord = console as unknown as Record<string, (...args: unknown[]) => void>;
  const originals = new Map<string, (...args: unknown[]) => void>();

  methodNames.forEach((name) => {
    const original = consoleRecord[name]?.bind(console);
    if (!original) {
      return;
    }
    originals.set(name, original);
    consoleRecord[name] = (...args: unknown[]) => {
      if (shouldIgnoreCaptchaConsoleNoise(args)) {
        return;
      }
      original(...args);
    };
  });

  return () => {
    originals.forEach((original, name) => {
      consoleRecord[name] = original;
    });
  };
}

function getSceneId(scene: CaptchaScene): string {
  if (scene === "login") {
    return process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SCENE_ID_LOGIN ?? "";
  }
  if (scene === "register") {
    return process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SCENE_ID_REGISTER ?? "";
  }
  return process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SCENE_ID_SMS ?? "";
}

function getCaptchaConfig(): { region: "cn" | "sgp"; prefix: string } {
  const regionText = (process.env.NEXT_PUBLIC_AUTH_CAPTCHA_REGION ?? "cn").toLowerCase();
  const region = regionText === "sgp" ? "sgp" : "cn";
  const prefix = (process.env.NEXT_PUBLIC_AUTH_CAPTCHA_PREFIX ?? "").trim();
  if (!prefix) {
    throw new Error("验证码配置缺失，请联系管理员");
  }
  return { region, prefix };
}

async function loadCaptchaScript(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("当前环境不支持验证码");
  }
  if (window.initAliyunCaptcha) {
    return;
  }
  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CAPTCHA_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("验证码脚本加载失败"));
      document.head.appendChild(script);
    });
  }
  await scriptLoadPromise;
}

function resolveCaptchaMountHost(): HTMLElement {
  const dialogNodes = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')
  );
  if (dialogNodes.length > 0) {
    return dialogNodes[dialogNodes.length - 1];
  }
  return document.body;
}

function createMountElement(id: string, tag: "div" | "button", host: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.id = id;
  node.style.position = "fixed";
  node.style.left = "0";
  node.style.top = "0";
  node.style.width = tag === "button" ? "120px" : "320px";
  node.style.height = "40px";
  node.style.opacity = "0";
  node.style.pointerEvents = "none";
  node.style.zIndex = "-1";
  node.style.overflow = "hidden";
  host.appendChild(node);
  return node;
}

export async function verifyAliyunCaptcha(scene: CaptchaScene): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("当前环境不支持验证码");
  }
  const sceneId = getSceneId(scene).trim();
  if (!sceneId) {
    throw new Error("验证码场景未配置");
  }

  const config = getCaptchaConfig();
  window.AliyunCaptchaConfig = {
    region: config.region,
    prefix: config.prefix,
  };
  await loadCaptchaScript();
  const initAliyunCaptcha = window.initAliyunCaptcha;
  if (!initAliyunCaptcha) {
    throw new Error("验证码初始化函数不可用");
  }

  return new Promise<string>((resolve, reject) => {
    const restoreConsole = installCaptchaConsoleNoiseFilter();
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const elementId = `aliyun-captcha-element-${unique}`;
    const buttonId = `aliyun-captcha-button-${unique}`;
    const mountHost = resolveCaptchaMountHost();
    const elementNode = createMountElement(elementId, "div", mountHost);
    const buttonNode = createMountElement(buttonId, "button", mountHost) as HTMLButtonElement;
    buttonNode.type = "button";
    buttonNode.tabIndex = -1;
    let finished = false;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    let instance: AliyunCaptchaInstance | null = null;
    let started = false;

    const cleanup = () => {
      restoreConsole();
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      if (elementNode.parentNode) {
        elementNode.parentNode.removeChild(elementNode);
      }
      if (buttonNode.parentNode) {
        buttonNode.parentNode.removeChild(buttonNode);
      }
    };

    const finish = (handler: () => void) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      handler();
    };

    const triggerVerification = () => {
      if (finished || started || !instance) {
        return;
      }
      started = true;
      try {
        instance.startTracelessVerification?.();
        instance.show?.();
      } catch {
        started = false;
        setTimeout(triggerVerification, 50);
      }
    };

    closeTimer = setTimeout(() => {
      finish(() => reject(new Error("验证码超时，请重试")));
    }, 90_000);

    initAliyunCaptcha({
      SceneId: sceneId,
      mode: "popup",
      element: `#${elementId}`,
      button: `#${buttonId}`,
      delayBeforeSuccess: false,
      language: "cn",
      getInstance: (captchaInstance) => {
        instance = captchaInstance;
        setTimeout(triggerVerification, 0);
      },
      success: (captchaVerifyParam) => {
        const text =
          typeof captchaVerifyParam === "string"
            ? captchaVerifyParam
            : JSON.stringify(captchaVerifyParam ?? {});
        finish(() => resolve(text));
      },
      fail: () => {
        finish(() => reject(new Error("验证码未通过，请重试")));
      },
      onError: () => {
        finish(() => reject(new Error("验证码服务异常，请稍后重试")));
      },
      onClose: () => {
        finish(() => reject(new Error("你已取消验证码验证")));
      },
    });

    setTimeout(triggerVerification, 50);
  });
}

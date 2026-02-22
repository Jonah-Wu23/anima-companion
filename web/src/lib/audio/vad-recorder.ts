import { resolveVADConfig } from '@/lib/audio/vad-config';

const VAD_SAMPLE_RATE = 16000;
// 资源路径版本号用于强制绕过 CDN/浏览器旧缓存，避免 VAD 资产升级后仍命中旧文件。
const VAD_ASSET_VERSION = '2026-02-22-1';
const VAD_WEB_ASSET_BASE_PATH = `/vad-web-${VAD_ASSET_VERSION}/`;
const ORT_ASSET_BASE_PATH = `/onnxruntime-${VAD_ASSET_VERSION}/`;

type MicVADInstance = {
  start: () => void;
  pause: () => void;
  destroy?: () => void;
};

type MicVADModule = {
  MicVAD: {
    new: (options: Record<string, unknown>) => Promise<MicVADInstance>;
  };
};

export type VADRecorderStatus = 'idle' | 'initializing' | 'listening' | 'speaking' | 'processing';

export interface VADRecorderOptions {
  onSpeechStart: () => void;
  onSpeechEnd: (audioBlob: Blob) => void | Promise<void>;
  onVADMisfire: () => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: VADRecorderStatus) => void;
  threshold?: number;
  preSpeechPadFrames?: number;
  redemptionFrames?: number;
  minSpeechFrames?: number;
}

function normalizeError(raw: unknown, fallback: string): Error {
  if (raw instanceof Error) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    return new Error(raw);
  }
  return new Error(fallback);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function toWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export class VADRecorder {
  private vad: MicVADInstance | null = null;
  private running = false;
  private status: VADRecorderStatus = 'idle';
  private startingPromise: Promise<void> | null = null;
  private startRequestId = 0;

  constructor(private readonly options: VADRecorderOptions) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    if (this.startingPromise) {
      await this.startingPromise;
      return;
    }

    const requestId = ++this.startRequestId;
    this.setStatus('initializing');

    this.startingPromise = (async () => {
      try {
        const instance = this.vad ?? (await this.createVADInstance());
        this.vad = instance;

        if (requestId !== this.startRequestId) {
          instance.pause();
          return;
        }

        await instance.start();

        if (requestId !== this.startRequestId) {
          instance.pause();
          return;
        }

        this.running = true;
        this.setStatus('listening');
      } catch (error) {
        const normalized = normalizeError(error, 'VAD 启动失败');
        this.running = false;
        this.setStatus('idle');
        this.options.onError?.(normalized);
        throw normalized;
      } finally {
        this.startingPromise = null;
      }
    })();

    await this.startingPromise;
  }

  stop(): void {
    this.startRequestId += 1;

    if (!this.running) {
      this.setStatus('idle');
      return;
    }

    this.running = false;
    this.vad?.pause();
    this.setStatus('idle');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): VADRecorderStatus {
    return this.status;
  }

  dispose(): void {
    this.stop();
    this.vad?.destroy?.();
    this.vad = null;
  }

  private async createVADInstance(): Promise<MicVADInstance> {
    if (typeof window === 'undefined') {
      throw new Error('VADRecorder 仅支持浏览器环境');
    }

    let vadModule: MicVADModule;
    try {
      vadModule = (await import('@ricky0123/vad-web')) as unknown as MicVADModule;
    } catch (error) {
      throw normalizeError(error, '缺少 @ricky0123/vad-web 依赖，请先安装后再启用 VAD');
    }

    const config = resolveVADConfig({
      threshold: this.options.threshold,
      preSpeechPadFrames: this.options.preSpeechPadFrames,
      redemptionFrames: this.options.redemptionFrames,
      minSpeechFrames: this.options.minSpeechFrames,
    });

    return vadModule.MicVAD.new({
      baseAssetPath: VAD_WEB_ASSET_BASE_PATH,
      onnxWASMBasePath: ORT_ASSET_BASE_PATH,
      positiveSpeechThreshold: config.threshold,
      negativeSpeechThreshold: Math.max(0.15, config.threshold - 0.15),
      preSpeechPadFrames: config.preSpeechPadFrames,
      redemptionFrames: config.redemptionFrames,
      minSpeechFrames: config.minSpeechFrames,
      ortConfig: (ort: {
        env: {
          logLevel?: string;
          wasm?: {
            numThreads?: number;
          };
        };
      }) => {
        ort.env.logLevel = 'error';
        if (ort.env.wasm) {
          // 避免在未开启 cross-origin isolation 的页面上触发线程初始化失败。
          ort.env.wasm.numThreads = 1;
        }
      },
      onSpeechStart: () => {
        if (!this.running) {
          return;
        }

        this.setStatus('speaking');
        try {
          this.options.onSpeechStart();
        } catch (error) {
          this.options.onError?.(normalizeError(error, 'onSpeechStart 回调执行失败'));
        }
      },
      onSpeechEnd: (audio: Float32Array) => {
        if (!this.running) {
          return;
        }

        this.setStatus('processing');

        void Promise.resolve()
          .then(async () => {
            const blob = toWavBlob(audio, VAD_SAMPLE_RATE);
            await this.options.onSpeechEnd(blob);
          })
          .catch((error) => {
            this.options.onError?.(normalizeError(error, 'onSpeechEnd 回调执行失败'));
          })
          .finally(() => {
            if (this.running) {
              this.setStatus('listening');
            }
          });
      },
      onVADMisfire: () => {
        if (!this.running) {
          return;
        }

        this.setStatus('listening');
        try {
          this.options.onVADMisfire();
        } catch (error) {
          this.options.onError?.(normalizeError(error, 'onVADMisfire 回调执行失败'));
        }
      },
    });
  }

  private setStatus(status: VADRecorderStatus): void {
    if (this.status === status) {
      return;
    }

    this.status = status;
    this.options.onStatusChange?.(status);
  }
}

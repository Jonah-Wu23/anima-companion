import * as THREE from 'three';
import type { PipelineStage } from '@/lib/store/pipelineStore';

export type ExpressionEmotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'embarrassed'
  | 'excited'
  | 'relaxed'
  | 'worried';

interface ExpressionTriggerOptions {
  intensity?: number;
  durationMs?: number;
  blendInMs?: number;
  blendOutMs?: number;
}

interface BaseEmotionOptions {
  intensity?: number;
}

type MorphChannel =
  | 'vowelA'
  | 'smile'
  | 'blink'
  | 'blinkHappy'
  | 'browDown'
  | 'browUp'
  | 'browSad'
  | 'mouthWide'
  | 'mouthSmile'
  | 'shy';

interface ActiveExpression {
  emotion: ExpressionEmotion;
  intensity: number;
  durationMs: number;
  blendInMs: number;
  blendOutMs: number;
  elapsedMs: number;
}

interface BaseExpression {
  emotion: ExpressionEmotion;
  intensity: number;
}

const CHANNEL_CANDIDATES: Record<MorphChannel, string[]> = {
  // 以 P2 已确认的「あ」口型为基础，在无专用 Morph 时回退到该口型。
  vowelA: ['あ', 'A', 'aa', 'vowel_a', 'mouth_a'],
  smile: ['笑い', 'にこり', 'smile', 'Smile', 'happy'],
  blink: ['まばたき', 'Blink', 'blink'],
  blinkHappy: ['笑い目', 'ｳｨﾝｸ', 'ウィンク', 'wink', 'Wink'],
  browDown: ['怒り', 'angry', 'brow_angry'],
  browUp: ['びっくり', 'surprised', 'brow_up'],
  browSad: ['困る', '悲しい', 'sad', 'brow_sad'],
  mouthWide: ['お', 'O', 'mouth_o'],
  mouthSmile: ['にやり', 'mouth_smile', 'smile_mouth'],
  shy: ['照れ', 'blush', 'embarrassed'],
};

const LIP_SYNC_CANDIDATES = ['あ', 'A', 'aa', 'い', 'I', 'ii', 'う', 'U', 'uu', 'え', 'E', 'ee', 'お', 'O', 'oo'];

const MOUTH_CHANNELS = new Set<MorphChannel>(['vowelA', 'mouthWide', 'mouthSmile']);

// 自动眨眼配置
const AUTO_BLINK = {
  minIntervalMs: 2000,      // 最小间隔 2 秒
  maxIntervalMs: 6000,      // 最大间隔 6 秒
  closeDurationMs: 100,     // 闭眼持续时间 100ms
  openDurationMs: 120,      // 睁眼持续时间 120ms
  intensity: 0.85,          // 眨眼强度
};

const EMOTION_PRESETS: Record<ExpressionEmotion, Partial<Record<MorphChannel, number>>> = {
  neutral: { vowelA: 0.04 },
  happy: { smile: 0.75, mouthSmile: 0.45, blinkHappy: 0.2, vowelA: 0.14 },
  sad: { browSad: 0.8, blink: 0.45, vowelA: 0.08 },
  angry: { browDown: 0.85, mouthWide: 0.2, vowelA: 0.1 },
  surprised: { browUp: 0.85, mouthWide: 0.65, blink: 0.1, vowelA: 0.2 },
  embarrassed: { shy: 0.8, blinkHappy: 0.35, mouthSmile: 0.25, vowelA: 0.1 },
  excited: { smile: 0.6, browUp: 0.35, mouthWide: 0.4, vowelA: 0.2 },
  relaxed: { blink: 0.28, smile: 0.2, vowelA: 0.08 },
  worried: { browSad: 0.6, browUp: 0.2, blink: 0.22, vowelA: 0.08 },
};

// 触发态口型增强：解决部分模型只有「あ」时点击表情嘴部变化不明显的问题。
const ACTIVE_MOUTH_ACCENT: Record<ExpressionEmotion, { vowelA: number; mouthWide?: number }> = {
  neutral: { vowelA: 0.26 },
  happy: { vowelA: 0.46 },
  sad: { vowelA: 0.28 },
  angry: { vowelA: 0.34, mouthWide: 0.22 },
  surprised: { vowelA: 0.44, mouthWide: 0.5 },
  embarrassed: { vowelA: 0.3 },
  excited: { vowelA: 0.48, mouthWide: 0.32 },
  relaxed: { vowelA: 0.3 },
  worried: { vowelA: 0.3 },
};

export class ExpressionDriver {
  private readonly channelIndices = new Map<MorphChannel, number>();
  private readonly trackedIndices = new Set<number>();
  private readonly lipSyncIndices = new Set<number>();
  private readonly mouthIndices = new Set<number>();
  private readonly currentWeights = new Map<number, number>();
  private activeExpression: ActiveExpression | null = null;
  private baseExpression: BaseExpression = { emotion: 'neutral', intensity: 0.58 };
  private stage: PipelineStage = 'idle';
  private lipSyncEnergy = 0;
  private currentMotion = '';

  // 自动眨眼状态
  private autoBlinkTimer = 0;
  private nextBlinkInMs: number;
  private isAutoBlinking = false;
  private autoBlinkPhase: 'closing' | 'opening' = 'closing';
  private autoBlinkElapsedMs = 0;

  constructor(
    private readonly mesh: THREE.SkinnedMesh,
    private readonly smoothing = 0.24
  ) {
    this.resolveChannelIndices();
    this.nextBlinkInMs = this.calcRandomBlinkInterval();
  }

  triggerEmotion(emotion: ExpressionEmotion, options: ExpressionTriggerOptions = {}): void {
    if (emotion === 'neutral') {
      this.clear(false);
      return;
    }

    this.activeExpression = {
      emotion,
      intensity: THREE.MathUtils.clamp(options.intensity ?? 0.7, 0, 1),
      durationMs: Math.max(120, options.durationMs ?? 1000),
      blendInMs: Math.max(60, options.blendInMs ?? 220),
      blendOutMs: Math.max(80, options.blendOutMs ?? 260),
      elapsedMs: 0,
    };
  }

  setBaseEmotion(emotion: ExpressionEmotion, options: BaseEmotionOptions = {}): void {
    this.baseExpression = {
      emotion,
      intensity: THREE.MathUtils.clamp(options.intensity ?? 0.58, 0, 1),
    };
  }

  setPipelineStage(stage: PipelineStage): void {
    this.stage = stage;
  }

  setLipSyncEnergy(energy: number): void {
    this.lipSyncEnergy = THREE.MathUtils.clamp(energy, 0, 1);
  }

  setCurrentMotion(motionName: string): void {
    this.currentMotion = motionName;
  }

  clear(immediate = false): void {
    this.activeExpression = null;
    if (!immediate) {
      return;
    }
    this.currentWeights.clear();
    const influences = this.mesh.morphTargetInfluences;
    if (!influences) {
      return;
    }
    this.trackedIndices.forEach((index) => {
      influences[index] = 0;
    });
  }

  update(delta = 1 / 60): void {
    const influences = this.mesh.morphTargetInfluences;
    if (!influences) {
      return;
    }

    const frameTargets = new Map<number, number>();
    const basePreset = EMOTION_PRESETS[this.baseExpression.emotion];
    const stageExpressionScale = this.resolveStageExpressionScale();
    Object.entries(basePreset).forEach(([channelKey, weight]) => {
      const channel = channelKey as MorphChannel;
      const index = this.channelIndices.get(channel);
      if (index === undefined) {
        return;
      }
      this.mergeTarget(
        frameTargets,
        index,
        (weight ?? 0) * this.baseExpression.intensity * stageExpressionScale,
        channel
      );
    });

    if (this.activeExpression) {
      this.activeExpression.elapsedMs += delta * 1000;
      const factor = this.resolveBlendFactor(this.activeExpression);
      const preset = EMOTION_PRESETS[this.activeExpression.emotion];
      Object.entries(preset).forEach(([channelKey, weight]) => {
        const channel = channelKey as MorphChannel;
        const index = this.channelIndices.get(channel);
        if (index === undefined) {
          return;
        }
        this.mergeTarget(
          frameTargets,
          index,
          (weight ?? 0) * this.activeExpression!.intensity * factor * stageExpressionScale,
          channel
        );
      });
      this.applyActiveMouthAccent(frameTargets, this.activeExpression, factor, stageExpressionScale);

      if (this.activeExpression.elapsedMs >= this.activeExpression.durationMs) {
        this.activeExpression = null;
      }
    }

    // 自动眨眼逻辑
    this.updateAutoBlink(delta, frameTargets);

    const interpolation = 1 - Math.pow(1 - this.smoothing, Math.max(1, delta * 60));
    this.trackedIndices.forEach((index) => {
      const target = frameTargets.get(index) ?? 0;
      const current = this.currentWeights.get(index) ?? 0;
      const next = THREE.MathUtils.lerp(current, target, interpolation);
      this.currentWeights.set(index, next);

      // 仅在口型通道保留 lip-sync 的基线；其余表情通道允许回落到 0，避免卡表情。
      if (this.lipSyncIndices.has(index)) {
        const base = influences[index] ?? 0;
        influences[index] = Math.max(base, next);
      } else {
        influences[index] = next;
      }
    });
  }

  private resolveBlendFactor(expression: ActiveExpression): number {
    const elapsed = expression.elapsedMs;
    const stayUntil = expression.durationMs - expression.blendOutMs;
    if (elapsed <= expression.blendInMs) {
      return THREE.MathUtils.clamp(elapsed / expression.blendInMs, 0, 1);
    }
    if (elapsed <= stayUntil) {
      return 1;
    }
    return THREE.MathUtils.clamp(
      1 - (elapsed - stayUntil) / Math.max(1, expression.blendOutMs),
      0,
      1
    );
  }

  private resolveChannelIndices(): void {
    this.channelIndices.clear();
    this.trackedIndices.clear();
    this.lipSyncIndices.clear();
    this.mouthIndices.clear();
    const dictionary = this.mesh.morphTargetDictionary;
    if (!dictionary) {
      return;
    }

    const resolvedIndices = new Set<number>();
    (Object.keys(CHANNEL_CANDIDATES) as MorphChannel[]).forEach((channel) => {
      const candidates = CHANNEL_CANDIDATES[channel];
      const matched = candidates.find((name) => {
        const index = dictionary[name];
        return index !== undefined && !resolvedIndices.has(index);
      });
      if (!matched) {
        return;
      }
      const index = dictionary[matched];
      this.channelIndices.set(channel, index);
      resolvedIndices.add(index);
      this.trackedIndices.add(index);
      if (MOUTH_CHANNELS.has(channel)) {
        this.mouthIndices.add(index);
      }
    });

    LIP_SYNC_CANDIDATES.forEach((name) => {
      const index = dictionary[name];
      if (index !== undefined) {
        this.lipSyncIndices.add(index);
        this.trackedIndices.add(index);
      }
    });
  }

  private calcRandomBlinkInterval(): number {
    return AUTO_BLINK.minIntervalMs + Math.random() * (AUTO_BLINK.maxIntervalMs - AUTO_BLINK.minIntervalMs);
  }

  private updateAutoBlink(delta: number, frameTargets: Map<number, number>): void {
    const blinkIndex = this.channelIndices.get('blink');
    if (blinkIndex === undefined) {
      return;
    }

    if (this.isAutoBlinking) {
      // 正在自动眨眼，更新阶段
      this.autoBlinkElapsedMs += delta * 1000;

      if (this.autoBlinkPhase === 'closing') {
        // 闭眼阶段
        const progress = Math.min(this.autoBlinkElapsedMs / AUTO_BLINK.closeDurationMs, 1);
        const currentBlinkWeight = frameTargets.get(blinkIndex) ?? 0;
        frameTargets.set(blinkIndex, Math.max(currentBlinkWeight, progress * AUTO_BLINK.intensity));

        if (this.autoBlinkElapsedMs >= AUTO_BLINK.closeDurationMs) {
          this.autoBlinkPhase = 'opening';
          this.autoBlinkElapsedMs = 0;
        }
      } else {
        // 睁眼阶段
        const progress = Math.min(this.autoBlinkElapsedMs / AUTO_BLINK.openDurationMs, 1);
        const currentBlinkWeight = frameTargets.get(blinkIndex) ?? 0;
        frameTargets.set(blinkIndex, Math.max(currentBlinkWeight, (1 - progress) * AUTO_BLINK.intensity));

        if (this.autoBlinkElapsedMs >= AUTO_BLINK.openDurationMs) {
          // 眨眼结束，重置状态
          this.isAutoBlinking = false;
          this.autoBlinkTimer = 0;
          this.nextBlinkInMs = this.calcRandomBlinkInterval();
        }
      }
    } else if (!this.activeExpression) {
      // 空闲时累积计时器
      this.autoBlinkTimer += delta * 1000;

      if (this.autoBlinkTimer >= this.nextBlinkInMs) {
        // 触发自动眨眼
        this.isAutoBlinking = true;
        this.autoBlinkPhase = 'closing';
        this.autoBlinkElapsedMs = 0;
      }
    } else {
      // 有表情活动时，重置自动眨眼计时器
      this.autoBlinkTimer = 0;
    }
  }

  private resolveStageExpressionScale(): number {
    if (this.stage === 'speaking') {
      return 0.78;
    }
    if (this.stage === 'recording') {
      return 0.88;
    }
    if (this.stage === 'processing' || this.stage === 'uploading') {
      return 0.62;
    }
    if (this.stage === 'error') {
      return 0.72;
    }
    return 1;
  }

  private resolveMouthExpressionScale(): number {
    const speakingByStage = this.stage === 'speaking';
    const speakingByMotion = /chat|speak|talk/i.test(this.currentMotion);
    const speakingBias = speakingByStage || speakingByMotion ? 0.85 : 0;
    const dampByEnergy = 1 - this.lipSyncEnergy * (0.6 + speakingBias * 0.25);
    const minScale = speakingByStage ? 0.22 : 0.35;
    return THREE.MathUtils.clamp(dampByEnergy, minScale, 1);
  }

  private applyActiveMouthAccent(
    frameTargets: Map<number, number>,
    expression: ActiveExpression,
    blendFactor: number,
    stageExpressionScale: number
  ): void {
    const accent = ACTIVE_MOUTH_ACCENT[expression.emotion];
    const vowelIndex = this.channelIndices.get('vowelA');
    if (vowelIndex !== undefined) {
      this.mergeTarget(
        frameTargets,
        vowelIndex,
        accent.vowelA * expression.intensity * blendFactor * stageExpressionScale,
        'vowelA'
      );
    }

    if (accent.mouthWide !== undefined) {
      const wideIndex = this.channelIndices.get('mouthWide');
      if (wideIndex !== undefined) {
        this.mergeTarget(
          frameTargets,
          wideIndex,
          accent.mouthWide * expression.intensity * blendFactor * stageExpressionScale,
          'mouthWide'
        );
      }
    }
  }

  private mergeTarget(
    frameTargets: Map<number, number>,
    index: number,
    weight: number,
    channel: MorphChannel
  ): void {
    const clamped = THREE.MathUtils.clamp(weight, 0, 1);
    const scaled = this.mouthIndices.has(index) && MOUTH_CHANNELS.has(channel)
      ? clamped * this.resolveMouthExpressionScale()
      : clamped;
    const current = frameTargets.get(index) ?? 0;
    frameTargets.set(index, Math.max(current, scaled));
  }
}

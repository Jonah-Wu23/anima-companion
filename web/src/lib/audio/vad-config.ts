export interface VADConfig {
  threshold: number;
  preSpeechPadFrames: number;
  redemptionFrames: number;
  minSpeechFrames: number;
}

export const DEFAULT_VAD_CONFIG: VADConfig = {
  threshold: 0.45,
  preSpeechPadFrames: 8,
  redemptionFrames: 18,
  minSpeechFrames: 4,
};

export function resolveVADConfig(overrides?: Partial<VADConfig>): VADConfig {
  return {
    threshold: overrides?.threshold ?? DEFAULT_VAD_CONFIG.threshold,
    preSpeechPadFrames: overrides?.preSpeechPadFrames ?? DEFAULT_VAD_CONFIG.preSpeechPadFrames,
    redemptionFrames: overrides?.redemptionFrames ?? DEFAULT_VAD_CONFIG.redemptionFrames,
    minSpeechFrames: overrides?.minSpeechFrames ?? DEFAULT_VAD_CONFIG.minSpeechFrames,
  };
}

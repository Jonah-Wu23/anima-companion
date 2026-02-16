import { create } from 'zustand';
import { Animation } from '../api/types';
import { useAvatarStore } from './avatarStore';

export type PipelineStage = 'idle' | 'recording' | 'uploading' | 'processing' | 'speaking' | 'error';
export type InputMode = 'vad' | 'push-to-talk' | 'text';
export type VADStatus = 'idle' | 'listening' | 'speaking' | 'processing';

interface PipelineState {
  stage: PipelineStage;
  error: string | null;
  avatarAnimation: Animation;
  lipSyncEnergy: number; // 0-1
  inputMode: InputMode;
  vadStatus: VADStatus;
  
  setStage: (stage: PipelineStage) => void;
  setError: (error: string | null) => void;
  setAvatarAnimation: (anim: Animation) => void;
  setLipSyncEnergy: (energy: number) => void;
  setInputMode: (mode: InputMode) => void;
  setVADStatus: (status: VADStatus) => void;
  reset: () => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  stage: 'idle',
  error: null,
  avatarAnimation: 'idle',
  lipSyncEnergy: 0,
  inputMode: 'push-to-talk',
  vadStatus: 'idle',

  setStage: (stage) =>
    set((state) => {
      if (process.env.NODE_ENV === 'development' && state.stage !== stage) {
        // 开发期最小状态流转日志，便于快速确认主链路与恢复链路。
        console.debug(`[pipeline] ${state.stage} -> ${stage}`);
      }
      // 语音播报结束后统一回收到中性表情，避免“说完后表情停留”。
      if (state.stage === 'speaking' && stage === 'idle') {
        useAvatarStore.getState().setEmotion('neutral');
      }
      return { stage };
    }),
  setError: (error) => set({ error }),
  setAvatarAnimation: (anim) => set({ avatarAnimation: anim }),
  setLipSyncEnergy: (energy) => set({ lipSyncEnergy: energy }),
  setInputMode: (mode) => set({ inputMode: mode }),
  setVADStatus: (status) => set({ vadStatus: status }),
  reset: () =>
    set({
      stage: 'idle',
      error: null,
      avatarAnimation: 'idle',
      lipSyncEnergy: 0,
      inputMode: 'push-to-talk',
      vadStatus: 'idle',
    }),
}));

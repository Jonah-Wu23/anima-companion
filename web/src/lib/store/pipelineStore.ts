import { create } from 'zustand';
import { Animation } from '../api/types';

export type PipelineStage = 'idle' | 'recording' | 'uploading' | 'processing' | 'speaking' | 'error';

interface PipelineState {
  stage: PipelineStage;
  error: string | null;
  avatarAnimation: Animation;
  lipSyncEnergy: number; // 0-1
  
  setStage: (stage: PipelineStage) => void;
  setError: (error: string | null) => void;
  setAvatarAnimation: (anim: Animation) => void;
  setLipSyncEnergy: (energy: number) => void;
  reset: () => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  stage: 'idle',
  error: null,
  avatarAnimation: 'idle',
  lipSyncEnergy: 0,

  setStage: (stage) => set({ stage }),
  setError: (error) => set({ error }),
  setAvatarAnimation: (anim) => set({ avatarAnimation: anim }),
  setLipSyncEnergy: (energy) => set({ lipSyncEnergy: energy }),
  reset: () => set({ stage: 'idle', error: null, avatarAnimation: 'idle', lipSyncEnergy: 0 }),
}));

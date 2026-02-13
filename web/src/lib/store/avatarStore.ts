import { create } from 'zustand';
import type { ModelStatus, MotionState } from '../api/types';

export type SceneStatus = 'loading' | 'ready' | 'error';

interface AvatarState {
  sceneStatus: SceneStatus;
  emotion: string; // 'neutral', 'happy', 'sad', etc.
  modelStatus: ModelStatus;
  currentMotion: MotionState | string;
  modelProgress: number; // 0-100

  setSceneStatus: (status: SceneStatus) => void;
  setEmotion: (emotion: string) => void;
  setModelStatus: (status: ModelStatus) => void;
  setCurrentMotion: (motion: MotionState | string) => void;
  setModelProgress: (progress: number) => void;
}

export const useAvatarStore = create<AvatarState>((set) => ({
  sceneStatus: 'loading',
  emotion: 'neutral',
  modelStatus: 'loading',
  currentMotion: 'idle',
  modelProgress: 0,

  setSceneStatus: (status) => set({ sceneStatus: status }),
  setEmotion: (emotion) => set({ emotion }),
  setModelStatus: (status) => set({ modelStatus: status }),
  setCurrentMotion: (motion) => set({ currentMotion: motion }),
  setModelProgress: (progress) => {
    const safeProgress = Number.isFinite(progress) ? progress : 0;
    set({ modelProgress: Math.min(100, Math.max(0, safeProgress)) });
  },
}));

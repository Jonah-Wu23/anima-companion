import { create } from 'zustand';

export type SceneStatus = 'loading' | 'ready' | 'error';

interface AvatarState {
  sceneStatus: SceneStatus;
  emotion: string; // 'neutral', 'happy', 'sad', etc.

  setSceneStatus: (status: SceneStatus) => void;
  setEmotion: (emotion: string) => void;
}

export const useAvatarStore = create<AvatarState>((set) => ({
  sceneStatus: 'loading',
  emotion: 'neutral',

  setSceneStatus: (status) => set({ sceneStatus: status }),
  setEmotion: (emotion) => set({ emotion }),
}));

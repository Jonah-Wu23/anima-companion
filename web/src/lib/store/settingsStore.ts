import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  autoPlayVoice: boolean;
  reducedMotion: boolean;
  saveLocalHistory: boolean;
  
  toggleAutoPlay: () => void;
  toggleReducedMotion: () => void;
  toggleSaveLocalHistory: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoPlayVoice: true,
      reducedMotion: false,
      saveLocalHistory: true,

      toggleAutoPlay: () => set((state) => ({ autoPlayVoice: !state.autoPlayVoice })),
      toggleReducedMotion: () => set((state) => ({ reducedMotion: !state.reducedMotion })),
      toggleSaveLocalHistory: () => set((state) => ({ saveLocalHistory: !state.saveLocalHistory })),
    }),
    { name: 'anima-settings-storage' }
  )
);

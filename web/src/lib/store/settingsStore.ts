import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  autoPlayVoice: boolean;
  reducedMotion: boolean;
  saveLocalHistory: boolean;
  vipModeEnabled: boolean;
  
  toggleAutoPlay: () => void;
  toggleReducedMotion: () => void;
  toggleSaveLocalHistory: () => void;
  toggleVipMode: () => void;
  enableVipMode: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoPlayVoice: true,
      reducedMotion: false,
      saveLocalHistory: true,
      vipModeEnabled: false,

      toggleAutoPlay: () => set((state) => ({ autoPlayVoice: !state.autoPlayVoice })),
      toggleReducedMotion: () => set((state) => ({ reducedMotion: !state.reducedMotion })),
      toggleSaveLocalHistory: () => set((state) => ({ saveLocalHistory: !state.saveLocalHistory })),
      toggleVipMode: () => set((state) => ({ vipModeEnabled: !state.vipModeEnabled })),
      enableVipMode: () => set({ vipModeEnabled: true }),
    }),
    { name: 'anima-settings-storage' }
  )
);

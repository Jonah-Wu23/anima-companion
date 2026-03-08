import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  autoPlayVoice: boolean;
  reducedMotion: boolean;
  saveLocalHistory: boolean;
  vipModeEnabled: boolean;
  vipAutoPromptDismissed: boolean;
  
  toggleAutoPlay: () => void;
  toggleReducedMotion: () => void;
  toggleSaveLocalHistory: () => void;
  toggleVipMode: () => void;
  enableVipMode: () => void;
  dismissVipAutoPrompt: () => void;
  resetVipAutoPrompt: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoPlayVoice: true,
      reducedMotion: false,
      saveLocalHistory: true,
      vipModeEnabled: false,
      vipAutoPromptDismissed: false,

      toggleAutoPlay: () => set((state) => ({ autoPlayVoice: !state.autoPlayVoice })),
      toggleReducedMotion: () => set((state) => ({ reducedMotion: !state.reducedMotion })),
      toggleSaveLocalHistory: () => set((state) => ({ saveLocalHistory: !state.saveLocalHistory })),
      toggleVipMode: () =>
        set((state) => ({
          vipModeEnabled: !state.vipModeEnabled,
          vipAutoPromptDismissed: state.vipModeEnabled ? state.vipAutoPromptDismissed : false,
        })),
      enableVipMode: () => set({ vipModeEnabled: true, vipAutoPromptDismissed: false }),
      dismissVipAutoPrompt: () => set({ vipAutoPromptDismissed: true }),
      resetVipAutoPrompt: () => set({ vipAutoPromptDismissed: false }),
    }),
    { name: 'anima-settings-storage' }
  )
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CHARACTER_ID } from '@/lib/characters/registry';
import type { CharacterId } from '@/lib/characters/types';
import {
  getDefaultModelByCharacter,
  getModelById,
  resolveModelCharacterId,
} from '@/lib/wardrobe/model-registry';
import { useWardrobeStore } from '@/lib/store/wardrobeStore';
import { useSessionStore } from '@/lib/store/sessionStore';
import { usePipelineStore } from '@/lib/store/pipelineStore';
import { useAvatarStore } from '@/lib/store/avatarStore';

interface CharacterState {
  currentCharacterId: CharacterId;
  setCurrentCharacter: (characterId: CharacterId) => void;
  syncCurrentCharacterModel: () => void;
}

function applyCharacterModel(characterId: CharacterId): void {
  const wardrobeState = useWardrobeStore.getState();
  const currentModel = getModelById(wardrobeState.currentModelId);
  const modelCharacterId = currentModel ? resolveModelCharacterId(currentModel) : DEFAULT_CHARACTER_ID;
  if (modelCharacterId === characterId) {
    return;
  }
  const recentModelId = wardrobeState.recentModelIds.find((modelId) => {
    const model = getModelById(modelId);
    if (!model || !model.isAvailable) {
      return false;
    }
    return resolveModelCharacterId(model) === characterId;
  });
  const nextModel = recentModelId ? getModelById(recentModelId) : getDefaultModelByCharacter(characterId);
  if (!nextModel || !nextModel.isAvailable) {
    const fallback = getDefaultModelByCharacter(characterId);
    wardrobeState.setCurrentModel(fallback.id);
    return;
  }
  wardrobeState.setCurrentModel(nextModel.id);
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      currentCharacterId: DEFAULT_CHARACTER_ID,
      setCurrentCharacter: (characterId) => {
        if (get().currentCharacterId === characterId) {
          return;
        }
        set({ currentCharacterId: characterId });
        applyCharacterModel(characterId);
        useSessionStore.getState().clearSession();
        usePipelineStore.getState().reset();
        const avatarState = useAvatarStore.getState();
        avatarState.setEmotion('neutral');
        avatarState.setCurrentMotion('idle');
      },
      syncCurrentCharacterModel: () => {
        applyCharacterModel(get().currentCharacterId);
      },
    }),
    { name: 'anima-character-storage' },
  ),
);

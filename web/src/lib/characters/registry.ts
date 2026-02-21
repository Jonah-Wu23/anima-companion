import type { CharacterId } from '@/lib/characters/types';

const DEFAULT_PERSONA_ID = (process.env.NEXT_PUBLIC_DEFAULT_PERSONA_ID || 'phainon').trim();
const DEFAULT_QWEN_VOICE_ID = (process.env.NEXT_PUBLIC_QWEN_VOICE_ID || '').trim();
const DEFAULT_QWEN_TARGET_MODEL = (process.env.NEXT_PUBLIC_QWEN_TARGET_MODEL || '').trim();

const PHAINON_QWEN_VOICE_ID = (
  process.env.NEXT_PUBLIC_QWEN_VOICE_ID_PHAINON ||
  DEFAULT_QWEN_VOICE_ID
).trim();
const PHAINON_QWEN_TARGET_MODEL = (
  process.env.NEXT_PUBLIC_QWEN_TARGET_MODEL_PHAINON ||
  DEFAULT_QWEN_TARGET_MODEL
).trim();
const LUOTIANYI_QWEN_VOICE_ID = (
  process.env.NEXT_PUBLIC_QWEN_VOICE_ID_LUOTIANYI ||
  DEFAULT_QWEN_VOICE_ID
).trim();
const LUOTIANYI_QWEN_TARGET_MODEL = (
  process.env.NEXT_PUBLIC_QWEN_TARGET_MODEL_LUOTIANYI ||
  DEFAULT_QWEN_TARGET_MODEL
).trim();

export interface CharacterTtsConfig {
  qwenVoiceId: string;
  qwenTargetModel: string;
}

export interface CharacterRegistryItem {
  id: CharacterId;
  name: string;
  fallbackShortName: string;
  profileImage: string;
  heroImages: string[];
  personaId: string;
  defaultModelId: string;
  motionManifestPath: string;
  albumPrefix: string;
  tts: CharacterTtsConfig;
}

export const AVAILABLE_CHARACTERS: CharacterRegistryItem[] = [
  {
    id: 'phainon',
    name: '白厄',
    fallbackShortName: '白',
    profileImage: '/assets/phainon-profile.jpg',
    heroImages: ['/images/hero-compressed.webp'],
    personaId: 'phainon',
    defaultModelId: 'model.Phainon',
    motionManifestPath: '/api/local-files/configs/motions/phainon-motion-manifest.json',
    albumPrefix: 'phainon-',
    tts: {
      qwenVoiceId: PHAINON_QWEN_VOICE_ID,
      qwenTargetModel: PHAINON_QWEN_TARGET_MODEL,
    },
  },
  {
    id: 'luotianyi',
    name: '洛天依',
    fallbackShortName: '洛',
    profileImage: '/assets/luotianyi-chat-avatar.png',
    heroImages: ['/images/hero-luotianyi-illustration-01-compressed.jpg'],
    personaId: 'luotianyi',
    defaultModelId: 'model.LuoTianyi_V4',
    motionManifestPath: '/api/local-files/configs/motions/luotianyi-motion-manifest.json',
    albumPrefix: 'luotianyi-',
    tts: {
      qwenVoiceId: LUOTIANYI_QWEN_VOICE_ID,
      qwenTargetModel: LUOTIANYI_QWEN_TARGET_MODEL,
    },
  },
];

const CHARACTER_MAP = new Map<CharacterId, CharacterRegistryItem>(
  AVAILABLE_CHARACTERS.map((item) => [item.id, item]),
);

export const DEFAULT_CHARACTER_ID: CharacterId = 'phainon';

export function getCharacterById(characterId: CharacterId): CharacterRegistryItem {
  return CHARACTER_MAP.get(characterId) ?? CHARACTER_MAP.get(DEFAULT_CHARACTER_ID)!;
}

export function getDefaultPersonaId(): string {
  return DEFAULT_PERSONA_ID || DEFAULT_CHARACTER_ID;
}

export function getCharacterPersonaId(characterId: CharacterId): string {
  const config = getCharacterById(characterId);
  return config.personaId || getDefaultPersonaId();
}

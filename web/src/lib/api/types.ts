export type Emotion = "neutral" | "happy" | "sad" | "angry" | "shy";
export type Animation = "idle" | "listen" | "think" | "speak" | "happy" | "sad" | "angry";
export type MemoryType = "preference" | "taboo" | "important_names" | "note";

export interface RelationshipDelta {
  trust: number;
  reliance: number;
  fatigue: number;
}

export interface MemoryWrite {
  key: string;
  value: string;
  type: MemoryType;
}

export interface ChatTextRequest {
  session_id: string;
  persona_id: string;
  user_text: string;
}

export interface ChatTextResponse {
  session_id: string;
  assistant_text: string;
  emotion: Emotion;
  animation: Animation;
  relationship_delta: RelationshipDelta;
  memory_writes: MemoryWrite[];
}

export interface ChatVoiceResponse {
  transcript_text: string;
  assistant_text: string;
  tts_media_type: string;
  tts_audio_base64: string;
  tts_error?: string | null;
  emotion: Emotion;
  animation: Animation;
}

export interface UserClearRequest {
  session_id: string;
}

export interface UserClearResponse {
  ok: boolean;
}

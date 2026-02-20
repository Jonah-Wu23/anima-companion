export type Emotion =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "surprised"
  | "embarrassed"
  | "excited"
  | "worried"
  | "relaxed"
  | "shy";
export type Animation = "idle" | "listen" | "think" | "speak" | "happy" | "sad" | "angry";
export type MemoryType = "preference" | "taboo" | "important_names" | "note";

export type ModelStatus = "loading" | "ready" | "error";
export type MotionState = "idle" | "listening" | "thinking" | "speaking" | "error";

export interface MotionManifestCandidate {
  asset_id: string;
  path: string;
  priority: number;
  fallback: boolean;
  risk?: string;
}

export interface MotionManifestState {
  candidates: MotionManifestCandidate[];
}

export interface MotionManifestDocument {
  version: number;
  validated_at?: string;
  states: Partial<Record<"Idle" | "Listening" | "Thinking" | "Speaking" | "Error", MotionManifestState>>;
}

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
  tts_provider?: "auto" | "qwen_clone_tts" | "gpt_sovits" | "cosyvoice_tts";
  qwen_voice_id?: string;
  qwen_target_model?: string;
}

export interface ChatTextResponse {
  session_id: string;
  assistant_text: string;
  emotion: Emotion;
  animation: Animation;
  relationship_delta: RelationshipDelta;
  memory_writes: MemoryWrite[];
}

export interface ChatTextVoiceResponse extends ChatTextResponse {
  tts_media_type: string;
  tts_audio_base64: string;
  tts_error?: string | null;
  tts_provider?: string | null;
}

export interface ChatVoiceResponse {
  transcript_text: string;
  assistant_text: string;
  tts_media_type: string;
  tts_audio_base64: string;
  tts_error?: string | null;
  tts_provider?: string | null;
  emotion: Emotion;
  animation: Animation;
}

export interface UserClearRequest {
  session_id: string;
}

export interface UserClearResponse {
  ok: boolean;
}

export interface AuthRegisterRequest {
  phone: string;
  sms_challenge_id: string;
  sms_code: string;
  password: string;
  captcha_verify_param: string;
}

export interface AuthLoginPasswordRequest {
  account: string;
  password: string;
  captcha_verify_param: string;
  remember_me: boolean;
}

export type AuthSmsScene = "register" | "login" | "reset_password";

export interface AuthSmsSendRequest {
  phone: string;
  scene: AuthSmsScene;
  captcha_verify_param: string;
}

export interface AuthSmsSendResponse {
  sms_challenge_id: string;
  retry_after_sec: number;
}

export interface AuthLoginSmsRequest {
  phone: string;
  sms_challenge_id: string;
  sms_code: string;
  captcha_verify_param: string;
  remember_me: boolean;
}

export interface AuthUser {
  id: number;
  account: string;
  created_at: number;
}

export interface AuthSessionResponse {
  user: AuthUser;
  expires_at: number;
}

export interface AuthLogoutResponse {
  ok: boolean;
}

export interface AuthRegisterEmailRequest {
  email: string;
  password: string;
  captcha_verify_param: string;
}

export interface AuthLoginEmailRequest {
  email: string;
  password: string;
  captcha_verify_param: string;
  remember_me: boolean;
}

export interface AuthBindEmailRequest {
  email: string;
  captcha_verify_param: string;
}

export interface AuthBindPhoneRequest {
  phone: string;
  sms_challenge_id: string;
  sms_code: string;
  captcha_verify_param: string;
}

export interface AuthIdentityBindingResponse {
  value: string | null;
  is_verified: boolean;
}

export interface AuthIdentitiesMeResponse {
  phone: AuthIdentityBindingResponse;
  email: AuthIdentityBindingResponse;
}

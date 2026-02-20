import axios from 'axios';
import { 
  AuthLoginPasswordRequest,
  AuthLoginSmsRequest,
  AuthLogoutResponse,
  AuthRegisterRequest,
  AuthRegisterEmailRequest,
  AuthLoginEmailRequest,
  AuthBindEmailRequest,
  AuthBindPhoneRequest,
  AuthUser,
  AuthIdentitiesMeResponse,
  AuthSmsSendRequest,
  AuthSmsSendResponse,
  AuthSessionResponse,
  ChatTextRequest, 
  ChatTextResponse, 
  ChatTextVoiceResponse,
  ChatVoiceResponse,
  UserClearRequest,
  UserClearResponse
} from './types';

interface VoiceTtsOptions {
  tts_provider?: "auto" | "qwen_clone_tts" | "gpt_sovits" | "cosyvoice_tts";
  qwen_voice_id?: string;
  qwen_target_model?: string;
}

// Create axios instance with default config
const apiClient = axios.create({
  // Default to 18000 to avoid stale legacy service on 8000.
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:18000',
  timeout: 30000, // 30s timeout
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Auth
  sendSmsCode: async (payload: AuthSmsSendRequest): Promise<AuthSmsSendResponse> => {
    const { data } = await apiClient.post<AuthSmsSendResponse>('/v1/auth/sms/send', payload);
    return data;
  },

  register: async (payload: AuthRegisterRequest): Promise<AuthSessionResponse> => {
    const { data } = await apiClient.post<AuthSessionResponse>('/v1/auth/register', payload);
    return data;
  },

  loginWithPassword: async (payload: AuthLoginPasswordRequest): Promise<AuthSessionResponse> => {
    const { data } = await apiClient.post<AuthSessionResponse>('/v1/auth/login/password', payload);
    return data;
  },

  loginWithSms: async (payload: AuthLoginSmsRequest): Promise<AuthSessionResponse> => {
    const { data } = await apiClient.post<AuthSessionResponse>('/v1/auth/login/sms', payload);
    return data;
  },

  registerWithEmail: async (payload: AuthRegisterEmailRequest): Promise<AuthSessionResponse> => {
    const { data } = await apiClient.post<AuthSessionResponse>('/v1/auth/register/email', payload);
    return data;
  },

  loginWithEmail: async (payload: AuthLoginEmailRequest): Promise<AuthSessionResponse> => {
    const { data } = await apiClient.post<AuthSessionResponse>('/v1/auth/login/email', payload);
    return data;
  },

  logout: async (): Promise<AuthLogoutResponse> => {
    const { data } = await apiClient.post<AuthLogoutResponse>('/v1/auth/logout');
    return data;
  },

  me: async (): Promise<AuthSessionResponse> => {
    const { data } = await apiClient.get<AuthSessionResponse>('/v1/auth/me');
    return data;
  },

  bindEmail: async (payload: AuthBindEmailRequest): Promise<AuthUser> => {
    const { data } = await apiClient.post<AuthUser>('/v1/auth/bind/email', payload);
    return data;
  },

  bindPhone: async (payload: AuthBindPhoneRequest): Promise<AuthUser> => {
    const { data } = await apiClient.post<AuthUser>('/v1/auth/bind/phone', payload);
    return data;
  },

  getIdentitiesMe: async (): Promise<AuthIdentitiesMeResponse> => {
    const { data } = await apiClient.get<AuthIdentitiesMeResponse>('/v1/auth/identities/me');
    return data;
  },

  // Chat Text
  chatText: async (payload: ChatTextRequest): Promise<ChatTextResponse> => {
    const { data } = await apiClient.post<ChatTextResponse>('/v1/chat/text', payload);
    return data;
  },

  // Chat Text + Voice (VIP)
  chatTextWithVoice: async (payload: ChatTextRequest): Promise<ChatTextVoiceResponse> => {
    const { data } = await apiClient.post<ChatTextVoiceResponse>('/v1/chat/text-with-voice', payload, {
      timeout: 1200000,
    });
    return data;
  },

  // Chat Voice (Multipart)
  chatVoice: async (
    sessionId: string, 
    personaId: string, 
    audioBlob: Blob,
    ttsOptions?: VoiceTtsOptions
  ): Promise<ChatVoiceResponse> => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('persona_id', personaId);
    formData.append('audio', audioBlob, 'voice.wav');
    if (ttsOptions?.tts_provider) {
      formData.append('tts_provider', ttsOptions.tts_provider);
    }
    if (ttsOptions?.qwen_voice_id) {
      formData.append('qwen_voice_id', ttsOptions.qwen_voice_id);
    }
    if (ttsOptions?.qwen_target_model) {
      formData.append('qwen_target_model', ttsOptions.qwen_target_model);
    }
    
    // Voice requests might take longer (upload + asr + llm + tts)
    const { data } = await apiClient.post<ChatVoiceResponse>('/v1/chat/voice', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 1200000, // 20m for long voice chain (ASR + LLM + TTS)
    });
    return data;
  },

  // Clear Session
  clearSession: async (payload: UserClearRequest): Promise<UserClearResponse> => {
    const { data } = await apiClient.post<UserClearResponse>('/v1/user/clear', payload);
    return data;
  }
};

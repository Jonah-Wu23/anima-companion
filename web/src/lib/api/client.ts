import axios from 'axios';
import { 
  ChatTextRequest, 
  ChatTextResponse, 
  ChatVoiceResponse,
  UserClearRequest,
  UserClearResponse
} from './types';

// Create axios instance with default config
const apiClient = axios.create({
  // Default to 18000 to avoid stale legacy service on 8000.
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:18000',
  timeout: 30000, // 30s timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Chat Text
  chatText: async (payload: ChatTextRequest): Promise<ChatTextResponse> => {
    const { data } = await apiClient.post<ChatTextResponse>('/v1/chat/text', payload);
    return data;
  },

  // Chat Voice (Multipart)
  chatVoice: async (
    sessionId: string, 
    personaId: string, 
    audioBlob: Blob
  ): Promise<ChatVoiceResponse> => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('persona_id', personaId);
    formData.append('audio', audioBlob, 'voice.wav');
    
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

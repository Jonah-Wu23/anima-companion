import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Emotion, RelationshipDelta } from '../api/types';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: Emotion;
  createdAt: number;
}

interface SessionState {
  sessionId: string;
  messages: Message[];
  relationship: RelationshipDelta;
  setSessionId: (id: string) => void;
  addMessage: (msg: Message) => void;
  updateRelationship: (delta: RelationshipDelta) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      sessionId: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'default-session',
      messages: [],
      relationship: { trust: 0, reliance: 0, fatigue: 0 },
      setSessionId: (id) => set({ sessionId: id }),
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      updateRelationship: (delta) => set((state) => ({
        relationship: {
          trust: state.relationship.trust + delta.trust,
          reliance: state.relationship.reliance + delta.reliance,
          fatigue: state.relationship.fatigue + delta.fatigue,
        }
      })),
      clearSession: () => set({ 
        sessionId: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'default-session', 
        messages: [], 
        relationship: { trust: 0, reliance: 0, fatigue: 0 } 
      }),
    }),
    { name: 'anima-session-storage' }
  )
);

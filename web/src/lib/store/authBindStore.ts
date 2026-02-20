import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthBindState {
  phone_sms_challenge_id: string;
  phone_sms_target: string;
  phone_sms_retry_until_ms: number;
  setPhoneSmsChallenge: (payload: {
    challengeId: string;
    phone: string;
    retryAfterSec: number;
  }) => void;
  clearPhoneSmsChallenge: () => void;
}

export const useAuthBindStore = create<AuthBindState>()(
  persist(
    (set) => ({
      phone_sms_challenge_id: '',
      phone_sms_target: '',
      phone_sms_retry_until_ms: 0,
      setPhoneSmsChallenge: ({ challengeId, phone, retryAfterSec }) => {
        const now = Date.now();
        const retryUntilMs = now + Math.max(0, retryAfterSec) * 1000;
        set({
          phone_sms_challenge_id: challengeId,
          phone_sms_target: phone,
          phone_sms_retry_until_ms: retryUntilMs,
        });
      },
      clearPhoneSmsChallenge: () =>
        set({
          phone_sms_challenge_id: '',
          phone_sms_target: '',
          phone_sms_retry_until_ms: 0,
        }),
    }),
    {
      name: 'anima-auth-bind-storage',
    }
  )
);


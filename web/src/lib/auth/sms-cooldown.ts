type SmsCooldownScope = 'login' | 'register';

interface SmsCooldownRecord {
  challengeId: string;
  phone: string;
  retryUntilMs: number;
}

const STORAGE_KEY_PREFIX = 'anima-auth-sms-cooldown';

function resolveStorageKey(scope: SmsCooldownScope): string {
  return `${STORAGE_KEY_PREFIX}:${scope}`;
}

export function readSmsCooldown(scope: SmsCooldownScope): SmsCooldownRecord | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(resolveStorageKey(scope));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SmsCooldownRecord>;
    if (
      typeof parsed.challengeId !== 'string' ||
      typeof parsed.phone !== 'string' ||
      typeof parsed.retryUntilMs !== 'number'
    ) {
      return null;
    }
    return {
      challengeId: parsed.challengeId,
      phone: parsed.phone,
      retryUntilMs: parsed.retryUntilMs,
    };
  } catch {
    return null;
  }
}

export function writeSmsCooldown(
  scope: SmsCooldownScope,
  payload: { challengeId: string; phone: string; retryAfterSec: number }
): void {
  if (typeof window === 'undefined') {
    return;
  }
  const retryUntilMs = Date.now() + Math.max(0, payload.retryAfterSec) * 1000;
  const record: SmsCooldownRecord = {
    challengeId: payload.challengeId,
    phone: payload.phone,
    retryUntilMs,
  };
  window.localStorage.setItem(resolveStorageKey(scope), JSON.stringify(record));
}

export function clearSmsCooldown(scope: SmsCooldownScope): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(resolveStorageKey(scope));
}

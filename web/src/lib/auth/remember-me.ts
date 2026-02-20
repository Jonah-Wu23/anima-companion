const BROWSER_SESSION_KEY = "anima-browser-session-id";
const NON_PERSISTENT_AUTH_KEY = "anima-non-persistent-auth-session-id";

function ensureBrowserSessionId(): string {
  const existing = window.sessionStorage.getItem(BROWSER_SESSION_KEY);
  if (existing && existing.trim()) {
    return existing;
  }
  const created = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(BROWSER_SESSION_KEY, created);
  return created;
}

export function markAuthPersistence(rememberMe: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  if (rememberMe) {
    window.localStorage.removeItem(NON_PERSISTENT_AUTH_KEY);
    return;
  }
  const sessionId = ensureBrowserSessionId();
  window.localStorage.setItem(NON_PERSISTENT_AUTH_KEY, sessionId);
}

export function shouldInvalidateNonPersistentAuth(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const markedSessionId = window.localStorage.getItem(NON_PERSISTENT_AUTH_KEY);
  if (!markedSessionId || !markedSessionId.trim()) {
    return false;
  }
  const currentSessionId = ensureBrowserSessionId();
  return markedSessionId !== currentSessionId;
}

export function clearNonPersistentAuthMarker(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(NON_PERSISTENT_AUTH_KEY);
}

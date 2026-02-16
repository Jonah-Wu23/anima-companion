"""Provider 可用性状态缓存与失败冷却。"""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
import time


@dataclass
class ProviderAvailabilityState:
    unavailable_until: float = 0.0
    last_error: str = ""
    last_failure_at: float = 0.0
    last_success_at: float = 0.0
    last_probe_ok: bool | None = None
    last_probe_at: float = 0.0


_STATES: dict[str, ProviderAvailabilityState] = {}
_LOCK = Lock()


def should_skip_provider(provider: str) -> tuple[bool, float]:
    now = time.time()
    with _LOCK:
        state = _STATES.get(provider)
        if not state:
            return False, 0.0
        if state.unavailable_until > now:
            return True, state.unavailable_until - now
        return False, 0.0


def mark_provider_success(provider: str) -> None:
    now = time.time()
    with _LOCK:
        state = _STATES.setdefault(provider, ProviderAvailabilityState())
        state.unavailable_until = 0.0
        state.last_error = ""
        state.last_success_at = now


def mark_provider_failure(provider: str, error: str, cooldown_seconds: float) -> None:
    now = time.time()
    with _LOCK:
        state = _STATES.setdefault(provider, ProviderAvailabilityState())
        state.last_error = str(error).strip()
        state.last_failure_at = now
        state.unavailable_until = now + max(cooldown_seconds, 1.0)


def should_probe(provider: str, min_interval_seconds: float) -> bool:
    now = time.time()
    with _LOCK:
        state = _STATES.setdefault(provider, ProviderAvailabilityState())
        return (now - state.last_probe_at) >= max(min_interval_seconds, 0.5)


def mark_probe_result(provider: str, ok: bool) -> None:
    now = time.time()
    with _LOCK:
        state = _STATES.setdefault(provider, ProviderAvailabilityState())
        state.last_probe_at = now
        state.last_probe_ok = ok


def get_provider_state(provider: str) -> ProviderAvailabilityState:
    with _LOCK:
        state = _STATES.get(provider)
        if not state:
            return ProviderAvailabilityState()
        return ProviderAvailabilityState(
            unavailable_until=state.unavailable_until,
            last_error=state.last_error,
            last_failure_at=state.last_failure_at,
            last_success_at=state.last_success_at,
            last_probe_ok=state.last_probe_ok,
            last_probe_at=state.last_probe_at,
        )


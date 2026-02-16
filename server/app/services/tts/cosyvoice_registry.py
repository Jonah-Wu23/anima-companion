"""CosyVoice voice_id 本地登记。"""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any

from app.core.settings import get_settings

_LOCK = Lock()


def get_voice_entry(alias: str) -> dict[str, Any] | None:
    if not alias.strip():
        return None
    payload = _load_registry()
    item = payload.get(alias.strip())
    if isinstance(item, dict):
        return item
    return None


def upsert_voice_entry(alias: str, entry: dict[str, Any]) -> None:
    clean_alias = alias.strip()
    if not clean_alias:
        return
    payload = _load_registry()
    payload[clean_alias] = dict(entry)
    _save_registry(payload)


def list_voice_entries() -> dict[str, dict[str, Any]]:
    payload = _load_registry()
    result: dict[str, dict[str, Any]] = {}
    for key, value in payload.items():
        if isinstance(value, dict):
            result[key] = dict(value)
    return result


def _load_registry() -> dict[str, Any]:
    path = _registry_path()
    with _LOCK:
        if not path.exists():
            return {}
        try:
            raw = path.read_text(encoding="utf-8")
            payload = json.loads(raw)
            if isinstance(payload, dict):
                return payload
        except (OSError, json.JSONDecodeError):
            return {}
    return {}


def _save_registry(payload: dict[str, Any]) -> None:
    path = _registry_path()
    with _LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def _registry_path() -> Path:
    return get_settings().cosyvoice_registry_path


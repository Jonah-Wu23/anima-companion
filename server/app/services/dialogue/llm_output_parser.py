"""LLM 标签解析与回退。"""

from __future__ import annotations

import json
import re
from typing import Any

EMOTIONS = {"neutral", "happy", "sad", "angry", "shy"}
ANIMATIONS = {"idle", "listen", "think", "speak", "happy", "sad", "angry"}
MEMORY_TYPES = {"preference", "taboo", "important_names", "note"}
DEFAULT_RELATIONSHIP = {"trust": 0, "reliance": 0, "fatigue": 0}


def parse_labeled_response(raw_text: str) -> dict[str, Any]:
    text = str(raw_text or "").strip()
    parsed_json = _try_parse_json(text)

    assistant_text = _parse_assistant_text(text, parsed_json)
    emotion = _parse_enum("emotion", text, parsed_json, EMOTIONS, "neutral")
    animation = _parse_enum("animation", text, parsed_json, ANIMATIONS, "speak")
    relationship_delta = _parse_relationship(text, parsed_json)
    memory_writes = _parse_memory_writes(text, parsed_json)

    return {
        "assistant_text": assistant_text or "我在。",
        "emotion": emotion,
        "animation": animation,
        "relationship_delta": relationship_delta,
        "memory_writes": memory_writes,
    }


def _parse_assistant_text(text: str, parsed_json: Any) -> str:
    if isinstance(parsed_json, dict):
        for key in ("assistant_text", "reply", "text", "content"):
            value = parsed_json.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    for tag in ("assistant", "reply", "assistant_text"):
        tagged = _extract_tag(text, tag)
        if tagged:
            return tagged
    line_value = _extract_line_value(text, "assistant_text")
    if line_value:
        return line_value
    return text


def _parse_enum(
    field: str,
    text: str,
    parsed_json: Any,
    choices: set[str],
    fallback: str,
) -> str:
    value: Any = None
    if isinstance(parsed_json, dict):
        value = parsed_json.get(field)
    if value is None:
        value = _extract_tag(text, field) or _extract_line_value(text, field)
    normalized = str(value or "").strip().lower()
    if normalized in choices:
        return normalized
    return fallback


def _parse_relationship(text: str, parsed_json: Any) -> dict[str, int]:
    raw: Any = None
    if isinstance(parsed_json, dict):
        raw = parsed_json.get("relationship_delta")
    if raw is None:
        raw = _extract_tag(text, "relationship_delta") or _extract_line_value(text, "relationship_delta")
    parsed = _try_parse_json(raw) if isinstance(raw, str) else raw
    if not isinstance(parsed, dict):
        return DEFAULT_RELATIONSHIP.copy()
    return {
        "trust": _to_int(parsed.get("trust")),
        "reliance": _to_int(parsed.get("reliance")),
        "fatigue": _to_int(parsed.get("fatigue")),
    }


def _parse_memory_writes(text: str, parsed_json: Any) -> list[dict[str, str]]:
    raw: Any = None
    if isinstance(parsed_json, dict):
        raw = parsed_json.get("memory_writes")
    if raw is None:
        raw = _extract_tag(text, "memory_writes") or _extract_line_value(text, "memory_writes")
    parsed = _try_parse_json(raw) if isinstance(raw, str) else raw
    if not isinstance(parsed, list):
        return []

    normalized: list[dict[str, str]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip()
        value = str(item.get("value", "")).strip()
        memory_type = str(item.get("type", "note")).strip()
        if not key or not value:
            continue
        if memory_type not in MEMORY_TYPES:
            memory_type = "note"
        normalized.append({"key": key, "value": value, "type": memory_type})
    return normalized


def _extract_tag(text: str, tag: str) -> str:
    patterns = [
        rf"\[{re.escape(tag)}\](.*?)\[/\s*{re.escape(tag)}\]",
        rf"<{re.escape(tag)}>(.*?)</\s*{re.escape(tag)}>",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if match:
            value = match.group(1).strip()
            if value:
                return value
    return ""


def _extract_line_value(text: str, field: str) -> str:
    match = re.search(
        rf"(?im)^\s*{re.escape(field)}\s*[:：]\s*(.+)$",
        text,
    )
    if not match:
        return ""
    return match.group(1).strip()


def _try_parse_json(raw: Any) -> Any:
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _to_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0

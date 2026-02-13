"""Persona 配置与角色卡加载。"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core.settings import get_settings


@dataclass(frozen=True)
class PersonaPromptContext:
    persona_id: str
    display_name: str
    description: str
    personality: str
    scenario: str
    first_message: str
    mes_example: str
    character_book: str
    system_prompt: str
    ai_initial_injection: str
    ai_additional_info: str
    ai_need_to_follow: str


def load_persona_prompt_context(persona_id: str) -> PersonaPromptContext | None:
    normalized = _normalize_key(persona_id)
    if not normalized:
        return None
    return _load_persona_prompt_context_cached(normalized)


@lru_cache(maxsize=16)
def _load_persona_prompt_context_cached(normalized_persona_id: str) -> PersonaPromptContext | None:
    settings = get_settings()
    card_path = _resolve_card_path(normalized_persona_id, settings.configs_root, settings.repo_root)
    if card_path is None:
        return None
    return _load_context_from_card(card_path, normalized_persona_id)


def _resolve_card_path(
    normalized_persona_id: str,
    configs_root: Path,
    repo_root: Path,
) -> Path | None:
    persona_dir = configs_root / "persona"
    if persona_dir.is_dir():
        for yaml_path in sorted(persona_dir.glob("*.yaml")) + sorted(persona_dir.glob("*.yml")):
            parsed = _parse_persona_yaml(yaml_path)
            if parsed is None:
                continue
            candidate_keys = {_normalize_key(parsed["id"])}
            for alias in parsed["aliases"]:
                candidate_keys.add(_normalize_key(alias))
            if normalized_persona_id not in candidate_keys:
                continue
            source_card = str(parsed["source_card"]).strip()
            if not source_card:
                continue
            resolved = _resolve_source_card_path(source_card, yaml_path, configs_root, repo_root)
            if resolved is not None:
                return resolved

    fallback_map = {
        "phainon": "Phainon_actor_card.json",
        "baie": "Phainon_actor_card.json",
        "白厄": "Phainon_actor_card.json",
    }
    fallback_name = fallback_map.get(normalized_persona_id)
    if not fallback_name:
        return None
    fallback_path = repo_root / fallback_name
    if fallback_path.is_file():
        return fallback_path
    return None


def _parse_persona_yaml(path: Path) -> dict[str, object] | None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None

    persona_id = ""
    source_card = ""
    aliases: list[str] = []
    in_aliases = False
    aliases_indent = 0

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))
        if in_aliases:
            if indent > aliases_indent and stripped.startswith("-"):
                alias_value = _strip_yaml_value(stripped[1:].strip())
                if alias_value:
                    aliases.append(alias_value)
                continue
            in_aliases = False

        key, sep, value = stripped.partition(":")
        if not sep:
            continue
        key = key.strip()
        value = value.strip()

        if key == "id":
            persona_id = _strip_yaml_value(value)
        elif key == "source_card":
            source_card = _strip_yaml_value(value)
        elif key == "aliases":
            in_aliases = True
            aliases_indent = indent
            inline_value = _strip_yaml_value(value)
            if inline_value:
                aliases.append(inline_value)

    if not persona_id:
        return None
    return {"id": persona_id, "aliases": aliases, "source_card": source_card}


def _resolve_source_card_path(
    source_card: str,
    yaml_path: Path,
    configs_root: Path,
    repo_root: Path,
) -> Path | None:
    source_path = Path(source_card)
    candidates: list[Path] = []
    if source_path.is_absolute():
        candidates.append(source_path)
    else:
        candidates.extend(
            [
                yaml_path.parent / source_path,
                configs_root / source_path,
                repo_root / source_path,
            ]
        )

    for path in candidates:
        if path.is_file():
            return path
    return None


def _load_context_from_card(card_path: Path, persona_id: str) -> PersonaPromptContext | None:
    try:
        payload = json.loads(card_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None

    data = payload.get("data")
    card_data = data if isinstance(data, dict) else {}

    display_name = _first_text(
        card_data.get("name"),
        payload.get("name"),
        persona_id,
    )
    description = _clip_text(_first_text(card_data.get("description"), payload.get("description")))
    personality = _clip_text(_first_text(card_data.get("personality"), payload.get("personality")))
    scenario = _clip_text(_first_text(card_data.get("scenario"), payload.get("scenario")))
    first_message = _clip_text(
        _first_text(card_data.get("first_mes"), payload.get("first_mes")),
        2000,
    )
    mes_example = _clip_prompt_blob(
        _first_prompt_blob(card_data.get("mes_example"), payload.get("mes_example")),
        6000,
    )
    character_book = _clip_prompt_blob(
        _first_prompt_blob(card_data.get("character_book"), payload.get("character_book")),
        9000,
    )
    system_prompt = _clip_text(_first_text(card_data.get("system_prompt"), payload.get("system_prompt")), 2200)
    ai_initial_injection = _clip_prompt_blob(
        _first_prompt_blob(card_data.get("AI_initial_injection"), payload.get("AI_initial_injection"))
    )
    ai_additional_info = _clip_prompt_blob(
        _first_prompt_blob(card_data.get("AI_additional_info"), payload.get("AI_additional_info"))
    )
    ai_need_to_follow = _clip_prompt_blob(
        _first_prompt_blob(card_data.get("AI_need_to_follow"), payload.get("AI_need_to_follow"))
    )

    return PersonaPromptContext(
        persona_id=persona_id,
        display_name=display_name,
        description=description,
        personality=personality,
        scenario=scenario,
        first_message=first_message,
        mes_example=mes_example,
        character_book=character_book,
        system_prompt=system_prompt,
        ai_initial_injection=ai_initial_injection,
        ai_additional_info=ai_additional_info,
        ai_need_to_follow=ai_need_to_follow,
    )


def _first_text(*values: object) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _first_prompt_blob(*values: object) -> str:
    for value in values:
        text = _prompt_blob_text(value)
        if text:
            return text
    return ""


def _prompt_blob_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value).strip()


def _clip_text(text: str, max_length: int = 1200) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 1].rstrip() + "…"


def _clip_prompt_blob(text: str, max_length: int = 10000) -> str:
    normalized = str(text or "").strip()
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 1].rstrip() + "…"


def _strip_yaml_value(value: str) -> str:
    text = str(value or "").strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
        return text[1:-1].strip()
    return text


def _normalize_key(value: str) -> str:
    return str(value or "").strip().lower().replace("-", "").replace("_", "").replace(" ", "")

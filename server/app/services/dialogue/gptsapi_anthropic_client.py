"""gptsapi Anthropc Messages 客户端。"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Iterable

import httpx

from app.core.settings import get_settings
from app.services.dialogue.persona_loader import load_persona_prompt_context


class GPTSAPIAnthropicClientError(RuntimeError):
    """LLM 请求失败。"""


DEFAULT_ASSISTANT_CHAR_LIMIT = 50
PERSONA_ASSISTANT_CHAR_LIMITS = {
    "luotianyi": 60,
}


def request_messages_completion(
    *,
    persona_id: str,
    messages: Iterable[dict[str, str]],
    relationship: dict[str, int],
    include_initial_injection: bool = True,
) -> str:
    settings = get_settings()
    api_key = settings.llm_api_key.strip()
    if not api_key:
        raise GPTSAPIAnthropicClientError("LLM_API_KEY 未配置")

    system_prompt = _build_system_prompt(
        persona_id,
        relationship,
        include_initial_injection=include_initial_injection,
    )
    normalized_messages = _normalize_messages(messages)
    url_chat_completions = _join_api_path(settings.llm_api_base_url, "chat/completions")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            response_payload = _request_chat_completions(
                client=client,
                url=url_chat_completions,
                model=settings.llm_model,
                max_tokens=settings.llm_max_tokens,
                system_prompt=system_prompt,
                messages=normalized_messages,
                headers=headers,
            )
    except httpx.HTTPError as exc:
        raise GPTSAPIAnthropicClientError(
            f"LLM 请求失败(固定端点={url_chat_completions}): {exc}"
        ) from exc
    except ValueError as exc:
        raise GPTSAPIAnthropicClientError("LLM 返回非 JSON 响应") from exc

    text = _extract_text(response_payload)
    if not text:
        payload_keys = ",".join(sorted(str(k) for k in response_payload.keys()))
        raise GPTSAPIAnthropicClientError(f"LLM 未返回文本内容，可用字段: {payload_keys}")
    return text

def _request_chat_completions(
    *,
    client: httpx.Client,
    url: str,
    model: str,
    max_tokens: int,
    system_prompt: str,
    messages: list[dict[str, str]],
    headers: dict[str, str],
) -> dict[str, Any]:
    payload_messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    payload_messages.extend(messages)
    payload = {
        "model": model,
        "max_completion_tokens": max_tokens,
        "messages": payload_messages,
    }
    if _is_kimi_25_model(model):
        # Kimi K2.5 默认启用 thinking，可能引入额外 reasoning 段，影响后续文本抽取。
        payload["thinking"] = {"type": "disabled"}
    resp = client.post(url, json=payload, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        raise ValueError("chat.completions 返回格式异常")
    return data


def _join_api_path(base_url: str, suffix: str) -> str:
    base = str(base_url or "").rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/{suffix}"
    return f"{base}/v1/{suffix}"


def _normalize_messages(messages: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for item in messages:
        role = str(item.get("role", "user")).strip().lower()
        if role not in {"user", "assistant"}:
            role = "user"
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        normalized.append({"role": role, "content": content})
    return normalized or [{"role": "user", "content": "你好"}]


def _build_system_prompt(
    persona_id: str,
    relationship: dict[str, int],
    *,
    include_initial_injection: bool = True,
) -> str:
    persona = load_persona_prompt_context(persona_id)
    assistant_char_limit = _resolve_assistant_char_limit(persona_id)
    global_injection_part = _load_global_dialogue_rules()
    persona_core_part = (
        f"当前 persona_id={persona_id}。"
        if persona is None
        else (
            f"当前 persona_id={persona_id}，角色名={persona.display_name}。"
            f"角色核心设定：{_build_persona_anchor_summary(persona)}"
            f"身份约束：你只能以“{persona.display_name}”身份回应，禁止自称其他名字或其他角色。"
            f"当用户询问你的姓名或身份时，必须明确回答“我是{persona.display_name}”。"
        )
    )
    persona_initial_part = ""
    if include_initial_injection and persona is not None:
        persona_initial_part = (
            f"{_format_optional_prompt_block('角色开场白参考（仅首轮）', persona.first_message)}"
            f"{_format_optional_prompt_block('角色对话示例（仅首轮）', persona.mes_example)}"
            f"{_format_optional_prompt_block('角色世界书（仅首轮）', persona.character_book)}"
            f"角色系统提示：{persona.system_prompt}"
            f"{_format_optional_prompt_block('角色总注入（仅首轮）', persona.ai_initial_injection)}"
            f"{_format_optional_prompt_block('角色AI补充材料（仅首轮）', persona.ai_additional_info)}"
            f"{_format_optional_prompt_block('角色AI需要遵循（仅首轮）', persona.ai_need_to_follow)}"
        )
    return (
        "你是陪伴助手角色，必须稳定遵循指定角色设定，默认使用中文回复。"
        f"{global_injection_part}"
        f"{persona_core_part}"
        f"{persona_initial_part}"
        f"当前关系值={relationship}。"
        "assistant 内容中，真正说出口的台词必须放入 <speak>...</speak>。"
        "动作、心理、场景、旁白必须写在 <speak> 标签外。"
        f"assistant 内容必须控制在 {assistant_char_limit} 个字以内（含标点），<speak> 标签本身不计入字数，超出时请自行压缩。"
        "输出必须严格包含以下标签："
        "[assistant]回复文本[/assistant]"
        "[emotion]neutral|happy|sad|angry|shy[/emotion]"
        "[animation]idle|listen|think|speak|happy|sad|angry[/animation]"
        "[relationship_delta]{\"trust\":0,\"reliance\":0,\"fatigue\":0}[/relationship_delta]"
        "[memory_writes][][/memory_writes]"
        "relationship_delta 和 memory_writes 必须是合法 JSON。"
    )


def _resolve_assistant_char_limit(persona_id: str) -> int:
    normalized = str(persona_id or "").strip().lower()
    if not normalized:
        return DEFAULT_ASSISTANT_CHAR_LIMIT
    return PERSONA_ASSISTANT_CHAR_LIMITS.get(normalized, DEFAULT_ASSISTANT_CHAR_LIMIT)


def _format_optional_prompt_block(title: str, content: str) -> str:
    text = str(content or "").strip()
    if not text:
        return ""
    return f"{title}：{text}"


def _clip_anchor_text(text: str, max_length: int = 120) -> str:
    normalized = " ".join(str(text or "").split())
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 1].rstrip() + "…"


def _build_persona_anchor_summary(persona: Any) -> str:
    description = _clip_anchor_text(getattr(persona, "description", ""), 120)
    personality = _clip_anchor_text(getattr(persona, "personality", ""), 120)
    scenario = _clip_anchor_text(getattr(persona, "scenario", ""), 120)
    parts = [part for part in (description, personality, scenario) if part]
    if not parts:
        return "无额外摘要。"
    return " ".join(parts)


@lru_cache(maxsize=1)
def _load_global_dialogue_rules() -> str:
    settings = get_settings()
    path = settings.configs_root / "prompts" / "dialogue_always_inject.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    if not isinstance(payload, dict):
        return ""
    raw_rules = payload.get("rules")
    if not isinstance(raw_rules, list):
        return ""

    rules: list[str] = []
    for item in raw_rules:
        text = str(item or "").strip()
        if text:
            rules.append(text)
    if not rules:
        return ""

    numbered = "\n".join(f"{index}. {rule}" for index, rule in enumerate(rules, start=1))
    return f"全局每轮注入规则：\n{numbered}\n"


def _extract_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    direct = _extract_text_from_content(payload.get("output_text"))
    if direct:
        return direct
    direct = _extract_text_from_content(payload.get("content"))
    if direct:
        return direct

    choices = payload.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            message = _extract_text_from_content(choice.get("message"))
            if message:
                return message
            delta = _extract_text_from_content(choice.get("delta"))
            if delta:
                return delta
            text = _extract_text_from_content(choice.get("text"))
            if text:
                return text
            refusal = _extract_text_from_content(choice.get("refusal"))
            if refusal:
                return refusal

    return ""


def _extract_text_from_content(content: Any) -> str:
    if isinstance(content, str):
        text = content.strip()
        return text if text else ""

    if isinstance(content, dict):
        content_type = str(content.get("type", "")).strip().lower()
        if content_type in {
            "reasoning",
            "reasoning_content",
            "thinking",
            "analysis",
            "tool_call",
            "tool_result",
        }:
            return ""
        if content_type in {"text", "output_text"}:
            typed_text = _extract_text_from_content(content.get("text"))
            if typed_text:
                return typed_text
            typed_output = _extract_text_from_content(content.get("output_text"))
            if typed_output:
                return typed_output
        for key in (
            "content",
            "text",
            "output_text",
            "value",
            "refusal",
        ):
            nested = _extract_text_from_content(content.get(key))
            if nested:
                return nested
        return ""

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            piece = _extract_text_from_content(item)
            if piece:
                parts.append(piece)
        if parts:
            return "\n".join(parts)

    return ""


def _is_kimi_25_model(model: str) -> bool:
    normalized = str(model or "").strip().lower()
    return normalized.startswith("kimi-k2.5")

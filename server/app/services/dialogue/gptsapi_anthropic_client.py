"""gptsapi Anthropc Messages 客户端。"""

from __future__ import annotations

from typing import Any, Iterable

import httpx

from app.core.settings import get_settings
from app.services.dialogue.persona_loader import load_persona_prompt_context


class GPTSAPIAnthropicClientError(RuntimeError):
    """LLM 请求失败。"""


def request_messages_completion(
    *,
    persona_id: str,
    messages: Iterable[dict[str, str]],
    relationship: dict[str, int],
) -> str:
    settings = get_settings()
    api_key = settings.llm_api_key.strip()
    if not api_key:
        raise GPTSAPIAnthropicClientError("LLM_API_KEY 未配置")

    url = f"{settings.llm_api_base_url.rstrip('/')}/v1/messages"
    payload = {
        "model": settings.llm_model,
        "max_tokens": settings.llm_max_tokens,
        "system": _build_system_prompt(persona_id, relationship),
        "messages": _normalize_messages(messages),
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            response_payload = resp.json()
    except httpx.HTTPError as exc:
        raise GPTSAPIAnthropicClientError(f"LLM 请求失败: {exc}") from exc
    except ValueError as exc:
        raise GPTSAPIAnthropicClientError("LLM 返回非 JSON 响应") from exc

    text = _extract_text(response_payload)
    if not text:
        raise GPTSAPIAnthropicClientError("LLM 未返回文本内容")
    return text


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


def _build_system_prompt(persona_id: str, relationship: dict[str, int]) -> str:
    persona = load_persona_prompt_context(persona_id)
    persona_part = (
        f"当前 persona_id={persona_id}。"
        if persona is None
        else (
            f"当前 persona_id={persona_id}，角色名={persona.display_name}。"
            f"角色简介：{persona.description}"
            f"角色性格：{persona.personality}"
            f"角色场景：{persona.scenario}"
            f"角色系统提示：{persona.system_prompt}"
        )
    )
    return (
        "你是陪伴助手角色，必须稳定遵循指定角色设定，默认使用中文回复。"
        f"{persona_part}"
        f"当前关系值={relationship}。"
        "assistant 内容只允许输出角色对用户说的话，不允许动作描写、心理描写、场景描写或旁白。"
        "assistant 内容必须控制在 20 个字以内（含标点），超出时请自行压缩。"
        "输出必须严格包含以下标签："
        "[assistant]回复文本[/assistant]"
        "[emotion]neutral|happy|sad|angry|shy[/emotion]"
        "[animation]idle|listen|think|speak|happy|sad|angry[/animation]"
        "[relationship_delta]{\"trust\":0,\"reliance\":0,\"fatigue\":0}[/relationship_delta]"
        "[memory_writes][][/memory_writes]"
        "relationship_delta 和 memory_writes 必须是合法 JSON。"
    )


def _extract_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return str(payload["output_text"]).strip()

    content = payload.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") != "text":
                continue
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
        if parts:
            return "\n".join(parts)

    return ""

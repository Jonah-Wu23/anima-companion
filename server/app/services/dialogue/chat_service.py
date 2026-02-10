"""文本/语音聊天编排。"""

from __future__ import annotations

from base64 import b64encode
import re
from typing import Any

from app.core.settings import get_settings
from app.repositories.session_store import SessionStore
from app.services.dialogue.gptsapi_anthropic_client import (
    GPTSAPIAnthropicClientError,
    request_messages_completion,
)
from app.services.dialogue.llm_output_parser import parse_labeled_response
from app.services.tts.gpt_sovits_client import GPTSoVITSClientError, synthesize


class ChatServiceError(RuntimeError):
    """聊天服务失败。"""

MAX_ASSISTANT_TEXT_CHARS = 50


def run_text_chat(
    *,
    store: SessionStore,
    session_id: str,
    persona_id: str,
    user_text: str,
) -> dict[str, Any]:
    clean_text = user_text.strip()
    if not clean_text:
        raise ChatServiceError("user_text 不能为空")

    store.add_message(session_id, "user", clean_text)
    settings = get_settings()
    history = store.list_recent_messages(session_id, limit=settings.dialogue_history_limit)
    relationship = store.get_relationship(session_id)

    try:
        llm_raw_text = request_messages_completion(
            persona_id=persona_id,
            messages=history,
            relationship=relationship,
        )
    except GPTSAPIAnthropicClientError as exc:
        raise ChatServiceError(str(exc)) from exc

    parsed = parse_labeled_response(llm_raw_text)
    assistant_text = _sanitize_assistant_text(str(parsed["assistant_text"]))
    relationship_delta = dict(parsed["relationship_delta"])
    memory_writes = list(parsed["memory_writes"])

    store.add_message(session_id, "assistant", assistant_text)
    store.upsert_memories(session_id, memory_writes)
    applied_relationship_delta = store.apply_relationship_delta(session_id, relationship_delta)

    return {
        "session_id": session_id,
        "assistant_text": assistant_text,
        "emotion": parsed["emotion"],
        "animation": parsed["animation"],
        "relationship_delta": applied_relationship_delta,
        "memory_writes": memory_writes,
    }


def synthesize_assistant_audio_base64(assistant_text: str) -> tuple[str, str]:
    payload = build_default_tts_payload(assistant_text)
    try:
        audio_bytes, media_type = synthesize(payload)
    except GPTSoVITSClientError as exc:
        raise ChatServiceError(str(exc)) from exc
    return media_type, b64encode(audio_bytes).decode("utf-8")


def build_default_tts_payload(text: str) -> dict[str, Any]:
    settings = get_settings()
    ref_audio_path = _normalize_ref_audio_path(settings.gpt_sovits_default_ref_audio_path)
    payload: dict[str, Any] = {
        "text": text,
        "text_lang": settings.gpt_sovits_default_text_lang,
        "prompt_lang": settings.gpt_sovits_default_prompt_lang,
        "prompt_text": settings.gpt_sovits_default_prompt_text,
        "media_type": "wav",
        "streaming_mode": False,
        "text_split_method": settings.gpt_sovits_text_split_method,
        "batch_size": settings.gpt_sovits_batch_size,
        "fragment_interval": settings.gpt_sovits_fragment_interval,
        "speed_factor": settings.gpt_sovits_speed_factor,
        "top_k": settings.gpt_sovits_top_k,
        "top_p": settings.gpt_sovits_top_p,
        "temperature": settings.gpt_sovits_temperature,
        "repetition_penalty": settings.gpt_sovits_repetition_penalty,
        "parallel_infer": settings.gpt_sovits_parallel_infer,
        "split_bucket": settings.gpt_sovits_split_bucket,
        "seed": settings.gpt_sovits_seed,
    }
    if ref_audio_path:
        payload["ref_audio_path"] = ref_audio_path
    if settings.gpt_sovits_aux_ref_audio_paths:
        payload["aux_ref_audio_paths"] = list(settings.gpt_sovits_aux_ref_audio_paths)
    return payload


def _normalize_ref_audio_path(raw_value: str) -> str:
    text = str(raw_value or "").strip().strip('"').strip("'")
    if not text:
        return ""
    normalized = text.lower().replace("\\", "/")
    placeholders = {
        "path/to/ref.wav",
        "path/to/reference.wav",
        "reference/placeholder.wav",
        "placeholder.wav",
    }
    if normalized in placeholders:
        return ""
    return text


def _sanitize_assistant_text(raw_text: str) -> str:
    text = str(raw_text or "").strip()
    if not text:
        return "我在。"

    # 去除常见动作/旁白包裹内容，只保留可直接说出口的台词。
    text = re.sub(r"\[[^\[\]]{1,60}\]", "", text)
    text = re.sub(r"【[^【】]{1,60}】", "", text)
    text = re.sub(r"\([^()]{1,60}\)", "", text)
    text = re.sub(r"（[^（）]{1,60}）", "", text)
    text = re.sub(r"\*[^*]{1,60}\*", "", text)

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if lines:
        text = lines[0]

    text = re.sub(r"\s+", "", text)
    if not text:
        return "我在。"

    if len(text) > MAX_ASSISTANT_TEXT_CHARS:
        text = _truncate_text_prefer_punctuation(text, MAX_ASSISTANT_TEXT_CHARS)

    return text or "我在。"


def _truncate_text_prefer_punctuation(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text

    head = text[:max_chars]
    best_index = -1
    for punctuation in ("。", "，", ".", ","):
        best_index = max(best_index, head.rfind(punctuation))

    if best_index >= max_chars // 2:
        return head[: best_index + 1].rstrip()
    return head.rstrip()

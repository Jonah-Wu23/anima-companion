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
from app.services.tts.tts_service import TTSServiceError, synthesize_with_fallback


class ChatServiceError(RuntimeError):
    """聊天服务失败。"""

ASSISTANT_TEXT_CHAR_LIMIT = 50
PERSONA_ASSISTANT_TEXT_CHAR_LIMITS = {
    "luotianyi": 60,
}


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
    user_turns = store.count_user_turns(session_id)

    try:
        llm_raw_text = request_messages_completion(
            persona_id=persona_id,
            messages=history,
            relationship=relationship,
            include_initial_injection=(user_turns <= 1),
        )
    except GPTSAPIAnthropicClientError as exc:
        raise ChatServiceError(str(exc)) from exc

    parsed = parse_labeled_response(llm_raw_text)
    raw_assistant_text = str(parsed["assistant_text"])
    assistant_text = _sanitize_assistant_text(
        raw_assistant_text,
        max_chars=_resolve_assistant_text_limit(persona_id),
    )
    assistant_tts_text = _extract_tts_speak_text(raw_assistant_text)
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
        "assistant_raw_text": raw_assistant_text,
        "assistant_tts_text": assistant_tts_text,
    }


def synthesize_assistant_audio_base64(
    assistant_text: str,
    *,
    force_tts_provider: str = "qwen_clone_tts",
    qwen_voice_id: str = "",
    qwen_target_model: str = "",
) -> tuple[str, str, str]:
    speak_text = _extract_tts_speak_text(assistant_text)
    if not speak_text:
        # 兼容模型未按约定输出 speak 标签时的降级路径，避免整条语音链路失败。
        speak_text = _sanitize_assistant_text(
            assistant_text,
            max_chars=ASSISTANT_TEXT_CHAR_LIMIT,
        )
    if not _has_pronounceable_content(speak_text):
        speak_text = "我在。"

    payload = build_default_tts_payload(
        speak_text,
        force_tts_provider=force_tts_provider,
        qwen_voice_id=qwen_voice_id,
        qwen_target_model=qwen_target_model,
    )
    try:
        result = synthesize_with_fallback(
            text=speak_text,
            gpt_sovits_payload=payload,
        )
        audio_bytes = result.audio_bytes
        media_type = result.media_type
        provider = result.provider
    except TTSServiceError as exc:
        raise ChatServiceError(str(exc)) from exc
    return media_type, b64encode(audio_bytes).decode("utf-8"), provider


def build_default_tts_payload(
    text: str,
    *,
    force_tts_provider: str = "qwen_clone_tts",
    qwen_voice_id: str = "",
    qwen_target_model: str = "",
) -> dict[str, Any]:
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
    normalized_provider = _normalize_tts_provider(force_tts_provider)
    if normalized_provider:
        payload["__force_provider"] = normalized_provider
    if qwen_voice_id.strip():
        payload["_qwen_voice_id_override"] = qwen_voice_id.strip()
    if qwen_target_model.strip():
        payload["_qwen_target_model_override"] = qwen_target_model.strip()
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


def _sanitize_assistant_text(raw_text: str, max_chars: int = ASSISTANT_TEXT_CHAR_LIMIT) -> str:
    text = str(raw_text or "").strip()
    if not text:
        return "我在。"

    speak_text = _extract_tts_speak_text(text)
    if speak_text:
        text = speak_text

    # 去除常见动作/旁白包裹内容，只保留可直接说出口的台词。
    text = re.sub(r"\[[^\[\]]{1,60}\]", "", text)
    text = re.sub(r"【[^【】]{1,60}】", "", text)
    text = re.sub(r"\([^()]{1,60}\)", "", text)
    text = re.sub(r"（[^（）]{1,60}）", "", text)
    text = re.sub(r"\*[^*]{1,60}\*", "", text)

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if lines:
        selected = ""
        for line in lines:
            if _has_pronounceable_content(line):
                selected = line
                break
        text = selected or lines[0]

    text = re.sub(r"\s+", "", text)
    if not text:
        return "我在。"

    if len(text) > max_chars:
        text = _truncate_text_prefer_punctuation(text, max_chars)

    if not _has_pronounceable_content(text):
        return "我在。"

    return text or "我在。"


def _extract_tts_speak_text(raw_text: str) -> str:
    text = str(raw_text or "")
    if not text:
        return ""

    blocks = re.findall(r"<speak>(.*?)</speak>", text, flags=re.IGNORECASE | re.DOTALL)
    if not blocks:
        # 兼容错误写法：<speak>你好<speak> 或仅有起始标签。
        opens = list(re.finditer(r"<speak>", text, flags=re.IGNORECASE))
        if len(opens) >= 2:
            blocks = [text[opens[0].end() : opens[1].start()]]
        elif len(opens) == 1:
            blocks = [text[opens[0].end() :]]
    if not blocks:
        return ""

    combined = "".join(part.strip() for part in blocks if part and part.strip())
    combined = re.sub(r"<[^>]+>", "", combined)
    return combined.strip()


def _has_pronounceable_content(text: str) -> bool:
    return bool(re.search(r"[0-9A-Za-z\u4e00-\u9fff]", str(text or "")))


def _resolve_assistant_text_limit(persona_id: str) -> int:
    normalized = str(persona_id or "").strip().lower()
    if not normalized:
        return ASSISTANT_TEXT_CHAR_LIMIT
    return PERSONA_ASSISTANT_TEXT_CHAR_LIMITS.get(normalized, ASSISTANT_TEXT_CHAR_LIMIT)


def _truncate_text_prefer_punctuation(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text

    head = text[:max_chars]
    sentence_end_index = -1
    for punctuation in ("。", "！", "？", "!", "?", "…"):
        sentence_end_index = max(sentence_end_index, head.rfind(punctuation))
    if sentence_end_index >= max_chars // 2:
        return head[: sentence_end_index + 1].rstrip()

    comma_like_index = -1
    for punctuation in ("，", ",", "、", "；", ";", "：", ":"):
        comma_like_index = max(comma_like_index, head.rfind(punctuation))
    if comma_like_index >= max_chars // 2:
        return _append_ellipsis(head[:comma_like_index].rstrip(), max_chars)

    return _append_ellipsis(head.rstrip(), max_chars)


def _append_ellipsis(text: str, max_chars: int) -> str:
    clean = str(text or "").rstrip()
    if not clean:
        return "…"
    if clean.endswith(("。", "！", "？", "!", "?", "…")):
        return clean
    if len(clean) >= max_chars:
        clean = clean[: max_chars - 1].rstrip()
    return f"{clean}…"


def _normalize_tts_provider(raw_value: str) -> str:
    text = str(raw_value or "").strip().lower()
    if text in {"qwen_clone_tts", "gpt_sovits", "cosyvoice_tts"}:
        return text
    if text in {"", "auto"}:
        return "qwen_clone_tts"
    return "qwen_clone_tts"

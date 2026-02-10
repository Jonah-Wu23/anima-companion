"""SenseVoice ASR 客户端。"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.settings import get_settings


class SenseVoiceClientError(RuntimeError):
    """SenseVoice 调用失败。"""


def transcribe_wav(audio_bytes: bytes, filename: str, lang: str | None = None) -> str:
    settings = get_settings()
    target_lang = (lang or settings.default_asr_lang).strip() or settings.default_asr_lang
    url = f"{settings.asr_base_url.rstrip('/')}/api/v1/asr"
    files = {
        "files": (filename, audio_bytes, "audio/wav"),
    }
    data = {"keys": "audio", "lang": target_lang}

    try:
        with httpx.Client(timeout=settings.asr_timeout_seconds) as client:
            resp = client.post(url, files=files, data=data)
            resp.raise_for_status()
            payload = resp.json()
    except httpx.HTTPError as exc:
        raise SenseVoiceClientError(f"ASR 请求失败: {exc}") from exc
    except ValueError as exc:
        raise SenseVoiceClientError("ASR 返回非 JSON 响应") from exc

    text = _extract_text(payload)
    if not text:
        payload_hint = str(payload)
        if len(payload_hint) > 240:
            payload_hint = payload_hint[:240] + "..."
        raise SenseVoiceClientError(f"ASR 未返回可用转写文本，响应: {payload_hint}")
    return text


def _extract_text(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("text", "clean_text", "raw_text", "transcript", "asr_text"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for key in ("result", "results", "data", "items", "segments"):
            if key in payload:
                text = _extract_text(payload[key])
                if text:
                    return text
    if isinstance(payload, list):
        for item in payload:
            text = _extract_text(item)
            if text:
                return text
    return ""

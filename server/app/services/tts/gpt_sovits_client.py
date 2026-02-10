"""GPT-SoVITS HTTP 客户端封装。"""

from __future__ import annotations

import json
from typing import Any
from urllib import error, request

from app.core.settings import get_settings


class GPTSoVITSClientError(RuntimeError):
    """GPT-SoVITS 接口请求失败。"""


def synthesize(payload: dict[str, Any]) -> tuple[bytes, str]:
    """调用 GPT-SoVITS /tts 并返回音频二进制与媒体类型。"""
    settings = get_settings()
    base_url = settings.gpt_sovits_base_url.rstrip("/")
    normalized_payload = _normalize_tts_payload(payload)

    try:
        return _post_json_for_audio(
            url=f"{base_url}/tts",
            payload=normalized_payload,
            timeout_seconds=settings.gpt_sovits_timeout_seconds,
        )
    except GPTSoVITSClientError as exc:
        if not _should_retry_with_auto_reference(normalized_payload, str(exc)):
            raise

        fallback_payload = {
            "text": str(normalized_payload.get("text", "")).strip(),
            "media_type": str(normalized_payload.get("media_type", "wav")).strip() or "wav",
            "streaming_mode": bool(normalized_payload.get("streaming_mode", False)),
        }
        if not fallback_payload["text"]:
            raise

        try:
            return _post_json_for_audio(
                url=f"{base_url}/tts_to_audio/",
                payload=fallback_payload,
                timeout_seconds=settings.gpt_sovits_timeout_seconds,
            )
        except GPTSoVITSClientError as fallback_exc:
            raise GPTSoVITSClientError(
                f"{exc}; 回退 /tts_to_audio/ 也失败: {fallback_exc}"
            ) from fallback_exc


def _post_json_for_audio(
    *,
    url: str,
    payload: dict[str, Any],
    timeout_seconds: float,
) -> tuple[bytes, str]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        url=url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read()
            media_type = resp.headers.get("Content-Type", "audio/wav")
            if media_type.startswith("application/json"):
                message = raw.decode("utf-8", errors="ignore")
                raise GPTSoVITSClientError(f"GPT-SoVITS 返回错误: {message}")
            return raw, media_type
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise GPTSoVITSClientError(f"HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise GPTSoVITSClientError(f"无法连接 GPT-SoVITS: {exc.reason}") from exc


def _should_retry_with_auto_reference(payload: dict[str, Any], message: str) -> bool:
    ref_audio = str(payload.get("ref_audio_path", "")).strip()
    lower_message = message.lower()
    if not ref_audio:
        return True
    keywords = [
        "ref_audio_path",
        "no such file",
        "not found",
        "not exists",
        "no exists",
        "path/to/ref.wav",
        "不存在",
        "无法找到",
    ]
    return any(item in lower_message for item in keywords)


def _normalize_tts_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    ref_audio_path = str(normalized.get("ref_audio_path", "")).strip().strip('"').strip("'")
    if not ref_audio_path:
        normalized.pop("ref_audio_path", None)
        return normalized

    value = ref_audio_path.lower().replace("\\", "/")
    if value in {
        "path/to/ref.wav",
        "path/to/reference.wav",
        "reference/placeholder.wav",
        "placeholder.wav",
    }:
        normalized.pop("ref_audio_path", None)
        return normalized

    normalized["ref_audio_path"] = ref_audio_path
    return normalized

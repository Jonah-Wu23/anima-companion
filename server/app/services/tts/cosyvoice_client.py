"""CosyVoice TTS 与声音复刻封装。"""

from __future__ import annotations

import re
import time
from typing import Any

from app.core.settings import get_settings


class CosyVoiceClientError(RuntimeError):
    """CosyVoice 请求失败。"""


def synthesize(text: str, *, model: str, voice_id: str) -> tuple[bytes, str]:
    dashscope = _load_dashscope_module()
    synthesizer_cls = _load_synthesizer_class()
    settings = get_settings()
    if not settings.dashscope_api_key.strip():
        raise CosyVoiceClientError("未配置 DASHSCOPE_API_KEY")
    if not voice_id.strip():
        raise CosyVoiceClientError("voice_id 为空，无法调用 CosyVoice 合成")

    dashscope.api_key = settings.dashscope_api_key.strip()
    try:
        synthesizer = synthesizer_cls(model=model, voice=voice_id)
        audio_data = synthesizer.call(text)
    except Exception as exc:  # noqa: BLE001 - 第三方 SDK 抛错类型不稳定
        raise CosyVoiceClientError(f"CosyVoice 合成失败: {exc}") from exc
    if not isinstance(audio_data, (bytes, bytearray)) or not audio_data:
        raise CosyVoiceClientError("CosyVoice 合成未返回有效音频")
    return bytes(audio_data), "audio/mpeg"


def create_voice(
    *,
    target_model: str,
    prefix: str,
    url: str,
    language_hints: list[str] | None = None,
) -> str:
    service = _build_enrollment_service()
    safe_prefix = _normalize_prefix(prefix)
    if not safe_prefix:
        raise CosyVoiceClientError("声音复刻 prefix 不合法（仅允许数字和小写字母，长度 < 10）")
    if not url.strip():
        raise CosyVoiceClientError("创建音色需要公网可访问的音频 URL")

    try:
        return str(
            service.create_voice(
                target_model=target_model,
                prefix=safe_prefix,
                url=url.strip(),
                language_hints=language_hints or ["zh"],
            )
        ).strip()
    except Exception as exc:  # noqa: BLE001
        raise CosyVoiceClientError(f"创建 CosyVoice 音色失败: {exc}") from exc


def list_voices(prefix: str | None = None, page_index: int = 0, page_size: int = 10) -> list[dict[str, Any]]:
    service = _build_enrollment_service()
    kwargs: dict[str, Any] = {
        "prefix": _normalize_prefix(prefix or "") if prefix else None,
        "page_index": page_index,
        "page_size": page_size,
    }
    try:
        voices = service.list_voices(**kwargs)
    except Exception as exc:  # noqa: BLE001
        raise CosyVoiceClientError(f"查询 CosyVoice 音色列表失败: {exc}") from exc
    if not isinstance(voices, list):
        return []
    return [item for item in voices if isinstance(item, dict)]


def query_voice(voice_id: str) -> dict[str, Any]:
    service = _build_enrollment_service()
    if not voice_id.strip():
        raise CosyVoiceClientError("voice_id 为空")
    try:
        data = service.query_voice(voice_id=voice_id.strip())
    except Exception as exc:  # noqa: BLE001
        raise CosyVoiceClientError(f"查询 CosyVoice 音色失败: {exc}") from exc
    if isinstance(data, dict):
        return data
    raise CosyVoiceClientError("CosyVoice query_voice 返回格式异常")


def wait_voice_ready(voice_id: str, *, poll_interval_seconds: float, max_attempts: int) -> dict[str, Any]:
    last_detail: dict[str, Any] = {}
    for _ in range(max(max_attempts, 1)):
        detail = query_voice(voice_id)
        last_detail = detail
        status = str(detail.get("status", "")).upper()
        if status == "OK":
            return detail
        if status == "UNDEPLOYED":
            raise CosyVoiceClientError("CosyVoice 音色审核未通过（UNDEPLOYED）")
        time.sleep(max(poll_interval_seconds, 0.5))
    raise CosyVoiceClientError(f"等待音色就绪超时: {last_detail}")


def probe_cosyvoice_ready() -> tuple[bool, str]:
    settings = get_settings()
    if not settings.dashscope_api_key.strip():
        return False, "DASHSCOPE_API_KEY 未配置"
    try:
        _load_dashscope_module()
        _load_synthesizer_class()
        _load_voice_enrollment_service_class()
    except CosyVoiceClientError as exc:
        return False, str(exc)
    return True, "ok"


def _build_enrollment_service() -> Any:
    dashscope = _load_dashscope_module()
    service_cls = _load_voice_enrollment_service_class()
    settings = get_settings()
    if not settings.dashscope_api_key.strip():
        raise CosyVoiceClientError("未配置 DASHSCOPE_API_KEY")
    dashscope.api_key = settings.dashscope_api_key.strip()
    return service_cls()


def _load_dashscope_module() -> Any:
    try:
        import dashscope  # type: ignore
    except ImportError as exc:  # pragma: no cover - 依赖环境
        raise CosyVoiceClientError("未安装 dashscope SDK，无法使用 CosyVoice") from exc
    return dashscope


def _load_synthesizer_class() -> Any:
    try:
        from dashscope.audio.tts_v2 import SpeechSynthesizer  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise CosyVoiceClientError("dashscope SDK 缺少 SpeechSynthesizer") from exc
    return SpeechSynthesizer


def _load_voice_enrollment_service_class() -> Any:
    try:
        from dashscope.audio.tts_v2 import VoiceEnrollmentService  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise CosyVoiceClientError("dashscope SDK 缺少 VoiceEnrollmentService") from exc
    return VoiceEnrollmentService


def _normalize_prefix(prefix: str) -> str:
    text = str(prefix or "").strip().lower()
    if not text:
        return ""
    if len(text) > 10:
        text = text[:10]
    if re.fullmatch(r"[0-9a-z]+", text):
        return text
    return ""


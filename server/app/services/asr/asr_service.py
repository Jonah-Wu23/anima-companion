"""ASR provider 编排：可用性探测 + 自动降级。"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import logging
import wave

import httpx

from app.core.settings import get_settings
from app.services.asr.fun_asr_realtime_client import (
    FunASRClientError,
    probe_fun_asr_ready,
    transcribe_audio_bytes_realtime,
)
from app.services.asr.sensevoice_client import SenseVoiceClientError, transcribe_wav
from app.services.provider_availability import (
    mark_probe_result,
    mark_provider_failure,
    mark_provider_success,
    should_probe,
    should_skip_provider,
)

logger = logging.getLogger(__name__)

SUPPORTED_ASR_PROVIDERS = {"sensevoice_http", "fun_asr_realtime"}


class ASRServiceError(RuntimeError):
    """ASR 服务失败。"""


class ASRUnavailableError(ASRServiceError):
    """所有 ASR provider 不可用。"""


@dataclass
class ASRResult:
    text: str
    provider: str


def transcribe_with_fallback(audio_bytes: bytes, filename: str, lang: str | None = None) -> ASRResult:
    settings = get_settings()
    providers = _resolve_asr_provider_priority()
    errors: list[str] = []

    for provider in providers:
        should_skip, wait_seconds = should_skip_provider(provider)
        if should_skip:
            errors.append(f"{provider}: 冷却中({wait_seconds:.1f}s)")
            continue

        ok, probe_reason = _probe_provider_if_needed(provider)
        if not ok:
            errors.append(f"{provider}: 探测失败({probe_reason})")
            mark_provider_failure(provider, probe_reason, settings.provider_failure_cooldown_seconds)
            continue

        try:
            text = _transcribe_with_provider(
                provider=provider,
                audio_bytes=audio_bytes,
                filename=filename,
                lang=lang,
            )
            mark_provider_success(provider)
            return ASRResult(text=text, provider=provider)
        except ASRServiceError as exc:
            mark_provider_failure(provider, str(exc), settings.provider_failure_cooldown_seconds)
            errors.append(f"{provider}: {exc}")
            logger.warning("ASR provider %s 调用失败: %s", provider, exc)

    reason = "; ".join(errors) if errors else "未配置可用 ASR provider"
    raise ASRUnavailableError(f"语音识别暂不可用，请改用文本输入继续对话。详情: {reason}")


def probe_asr_providers() -> dict[str, dict[str, str | bool]]:
    statuses: dict[str, dict[str, str | bool]] = {}
    for provider in _resolve_asr_provider_priority():
        ok, reason = _probe_provider(provider)
        statuses[provider] = {"ok": ok, "reason": reason}
    return statuses


def _resolve_asr_provider_priority() -> list[str]:
    settings = get_settings()
    resolved: list[str] = []
    for provider in settings.asr_provider_priority:
        key = provider.strip().lower()
        if key in SUPPORTED_ASR_PROVIDERS:
            resolved.append(key)
    if not resolved:
        return ["sensevoice_http", "fun_asr_realtime"]
    return resolved


def _probe_provider_if_needed(provider: str) -> tuple[bool, str]:
    settings = get_settings()
    if not should_probe(provider, settings.provider_probe_interval_seconds):
        return True, "probe_cached"
    ok, reason = _probe_provider(provider)
    mark_probe_result(provider, ok)
    return ok, reason


def _probe_provider(provider: str) -> tuple[bool, str]:
    settings = get_settings()
    if provider == "sensevoice_http":
        url = settings.asr_base_url.rstrip("/")
        try:
            with httpx.Client(timeout=settings.provider_probe_timeout_seconds) as client:
                # 连接可达即可；返回 404 也视作服务在线。
                response = client.get(url)
                _ = response.status_code
            return True, "ok"
        except httpx.HTTPError as exc:
            return False, f"SenseVoice 不可达: {exc}"
    if provider == "fun_asr_realtime":
        return probe_fun_asr_ready()
    return False, f"未知 provider: {provider}"


def _transcribe_with_provider(
    *,
    provider: str,
    audio_bytes: bytes,
    filename: str,
    lang: str | None,
) -> str:
    settings = get_settings()
    if provider == "sensevoice_http":
        try:
            return transcribe_wav(audio_bytes, filename=filename, lang=lang)
        except SenseVoiceClientError as exc:
            raise ASRServiceError(str(exc)) from exc

    if provider == "fun_asr_realtime":
        fmt = _infer_audio_format(filename, fallback=settings.fun_asr_format)
        sample_rate = _infer_sample_rate(
            audio_bytes=audio_bytes,
            audio_format=fmt,
            fallback=settings.fun_asr_sample_rate,
        )
        try:
            return transcribe_audio_bytes_realtime(
                audio_bytes,
                audio_format=fmt,
                sample_rate=sample_rate,
            )
        except FunASRClientError as exc:
            raise ASRServiceError(str(exc)) from exc

    raise ASRServiceError(f"不支持的 ASR provider: {provider}")


def _infer_audio_format(filename: str, *, fallback: str) -> str:
    text = str(filename or "").strip().lower()
    if "." in text:
        suffix = text.rsplit(".", 1)[-1]
        if suffix in {"pcm", "wav", "mp3", "opus", "speex", "aac", "amr"}:
            return suffix
    return fallback


def _infer_sample_rate(*, audio_bytes: bytes, audio_format: str, fallback: int) -> int:
    if audio_format != "wav":
        return fallback
    try:
        with wave.open(BytesIO(audio_bytes), "rb") as wav_reader:
            sample_rate = wav_reader.getframerate()
            if sample_rate > 0:
                return sample_rate
    except Exception:  # noqa: BLE001
        return fallback
    return fallback

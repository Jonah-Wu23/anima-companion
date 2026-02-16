"""TTS provider 编排：GPT-SoVITS / 千问声音复刻自动降级。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import logging
from typing import Any

import httpx

from app.core.settings import get_settings
from app.services.provider_availability import (
    mark_probe_result,
    mark_provider_failure,
    mark_provider_success,
    should_probe,
    should_skip_provider,
)
from app.services.tts import cosyvoice_registry
from app.services.tts.gpt_sovits_client import GPTSoVITSClientError, synthesize as synthesize_gpt_sovits
from app.services.tts.qwen_voice_clone_client import (
    QwenVoiceClientError,
    create_voice,
    delete_voice,
    list_voices,
    probe_qwen_ready,
    query_voice,
    synthesize as synthesize_qwen_clone_tts,
    wait_voice_ready,
)

logger = logging.getLogger(__name__)

PRIMARY_QWEN_PROVIDER = "qwen_clone_tts"
LEGACY_COSYVOICE_PROVIDER = "cosyvoice_tts"
SUPPORTED_TTS_PROVIDERS = {"gpt_sovits", PRIMARY_QWEN_PROVIDER, LEGACY_COSYVOICE_PROVIDER}


class TTSServiceError(RuntimeError):
    """TTS 服务失败。"""


class TTSUnavailableError(TTSServiceError):
    """所有 TTS provider 不可用。"""


@dataclass
class TTSSynthesizeResult:
    audio_bytes: bytes
    media_type: str
    provider: str
    voice_id: str = ""


@dataclass
class VoiceCloneEnrollmentResult:
    voice_id: str
    status: str
    target_model: str
    reused: bool


# 兼容旧命名，避免影响已引用代码。
CosyVoiceEnrollmentResult = VoiceCloneEnrollmentResult


def synthesize_with_fallback(
    *,
    text: str,
    gpt_sovits_payload: dict[str, Any] | None = None,
) -> TTSSynthesizeResult:
    settings = get_settings()
    force_provider = ""
    if gpt_sovits_payload:
        force_provider = str(gpt_sovits_payload.get("__force_provider", "")).strip().lower()
    providers = _resolve_tts_provider_priority(force_provider=force_provider)
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
            result = _synthesize_with_provider(
                provider=provider,
                text=text,
                gpt_sovits_payload=gpt_sovits_payload,
            )
            mark_provider_success(provider)
            return result
        except TTSServiceError as exc:
            mark_provider_failure(provider, str(exc), settings.provider_failure_cooldown_seconds)
            errors.append(f"{provider}: {exc}")
            logger.warning("TTS provider %s 调用失败: %s", provider, exc)

    reason = "; ".join(errors) if errors else "未配置可用 TTS provider"
    raise TTSUnavailableError(f"TTS 暂不可用，已降级纯文本。详情: {reason}")


def probe_tts_providers() -> dict[str, dict[str, str | bool]]:
    statuses: dict[str, dict[str, str | bool]] = {}
    for provider in _resolve_tts_provider_priority():
        ok, reason = _probe_provider(provider)
        statuses[provider] = {"ok": ok, "reason": reason}
    return statuses


def enroll_or_reuse_qwen_voice(
    *,
    audio_url: str | None = None,
    prefix: str | None = None,
    target_model: str | None = None,
    language_hints: list[str] | None = None,
    wait_ready: bool = True,
) -> VoiceCloneEnrollmentResult:
    settings = get_settings()
    chosen_model = (target_model or settings.cosyvoice_target_model).strip()
    if not chosen_model:
        raise ValueError("CosyVoice target_model 不能为空，请检查配置或传入参数")
    chosen_prefix = (prefix or settings.cosyvoice_voice_prefix).strip()
    if not chosen_prefix:
        raise ValueError("CosyVoice voice_prefix 不能为空，请检查配置或传入参数")
    chosen_audio_url = (audio_url or settings.cosyvoice_enroll_audio_url).strip()
    if not chosen_audio_url:
        raise ValueError("CosyVoice enroll_audio_url 不能为空，请检查配置或传入参数")
    chosen_hints = language_hints or list(settings.cosyvoice_language_hints or ("zh",))

    try:
        existing_voice = _resolve_qwen_voice_id(allow_auto_enroll=False)
        if existing_voice:
            detail = query_voice(existing_voice)
            status = str(detail.get("status", "OK"))
            cosyvoice_registry.upsert_voice_entry(
                settings.cosyvoice_voice_alias,
                {
                    "voice_id": existing_voice,
                    "target_model": detail.get("target_model", chosen_model),
                    "status": status,
                    "source": "existing",
                    "updated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                },
            )
            return VoiceCloneEnrollmentResult(
                voice_id=existing_voice,
                status=status,
                target_model=str(detail.get("target_model", chosen_model)),
                reused=True,
            )

        if not chosen_audio_url:
            raise TTSServiceError(
                "未找到可复用 voice_id，且未提供 QWEN_ENROLL_AUDIO_URL/COSYVOICE_ENROLL_AUDIO_URL。"
                "请先将参考音频上传至公网 URL。"
            )

        voice_id = create_voice(
            target_model=chosen_model,
            prefix=chosen_prefix,
            url=chosen_audio_url,
            language_hints=chosen_hints,
        )

        status = "OK"
        if wait_ready:
            detail = wait_voice_ready(
                voice_id,
                poll_interval_seconds=settings.cosyvoice_poll_interval_seconds,
                max_attempts=settings.cosyvoice_poll_max_attempts,
            )
            status = str(detail.get("status", "OK"))

        cosyvoice_registry.upsert_voice_entry(
            settings.cosyvoice_voice_alias,
            {
                "voice_id": voice_id,
                "target_model": chosen_model,
                "status": status,
                "source": "enrollment",
                "audio_url": chosen_audio_url,
                "updated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            },
        )
        return VoiceCloneEnrollmentResult(
            voice_id=voice_id,
            status=status,
            target_model=chosen_model,
            reused=False,
        )
    except QwenVoiceClientError as exc:
        raise TTSServiceError(str(exc)) from exc


def list_qwen_voices(prefix: str | None = None, page_index: int = 0, page_size: int = 10) -> list[dict[str, Any]]:
    try:
        return list_voices(prefix=prefix, page_index=page_index, page_size=page_size)
    except QwenVoiceClientError as exc:
        raise TTSServiceError(str(exc)) from exc


def delete_qwen_voice(voice_id: str) -> None:
    try:
        delete_voice(voice_id=voice_id)
    except QwenVoiceClientError as exc:
        raise TTSServiceError(str(exc)) from exc


# 兼容旧命名/旧路由调用。
def enroll_or_reuse_cosyvoice_voice(
    *,
    audio_url: str | None = None,
    prefix: str | None = None,
    target_model: str | None = None,
    language_hints: list[str] | None = None,
    wait_ready: bool = True,
) -> VoiceCloneEnrollmentResult:
    return enroll_or_reuse_qwen_voice(
        audio_url=audio_url,
        prefix=prefix,
        target_model=target_model,
        language_hints=language_hints,
        wait_ready=wait_ready,
    )


def list_cosyvoice_voices(prefix: str | None = None, page_index: int = 0, page_size: int = 10) -> list[dict[str, Any]]:
    return list_qwen_voices(prefix=prefix, page_index=page_index, page_size=page_size)


def _resolve_tts_provider_priority(force_provider: str = "") -> list[str]:
    forced = force_provider.strip().lower()
    if forced in SUPPORTED_TTS_PROVIDERS:
        if forced == LEGACY_COSYVOICE_PROVIDER:
            return [PRIMARY_QWEN_PROVIDER]
        return [forced]

    settings = get_settings()
    resolved: list[str] = []
    for provider in settings.tts_provider_priority:
        key = provider.strip().lower()
        if key == LEGACY_COSYVOICE_PROVIDER:
            key = PRIMARY_QWEN_PROVIDER
        if key in SUPPORTED_TTS_PROVIDERS and key not in resolved:
            resolved.append(key)
    if not resolved:
        return [PRIMARY_QWEN_PROVIDER, "gpt_sovits"]
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
    if provider == "gpt_sovits":
        url = settings.gpt_sovits_base_url.rstrip("/")
        try:
            with httpx.Client(timeout=settings.provider_probe_timeout_seconds) as client:
                response = client.get(url)
                _ = response.status_code
            return True, "ok"
        except httpx.HTTPError as exc:
            return False, f"GPT-SoVITS 不可达: {exc}"
    if provider in {PRIMARY_QWEN_PROVIDER, LEGACY_COSYVOICE_PROVIDER}:
        return probe_qwen_ready()
    return False, f"未知 provider: {provider}"


def _synthesize_with_provider(
    *,
    provider: str,
    text: str,
    gpt_sovits_payload: dict[str, Any] | None,
) -> TTSSynthesizeResult:
    if provider == "gpt_sovits":
        payload = dict(gpt_sovits_payload or {"text": text, "media_type": "wav", "streaming_mode": False})
        payload.pop("__force_provider", None)
        payload.pop("_cosyvoice_voice_id_override", None)
        payload.pop("_cosyvoice_target_model_override", None)
        payload.pop("_qwen_voice_id_override", None)
        payload.pop("_qwen_target_model_override", None)
        payload["text"] = text
        try:
            audio_bytes, media_type = synthesize_gpt_sovits(payload)
        except GPTSoVITSClientError as exc:
            raise TTSServiceError(str(exc)) from exc
        return TTSSynthesizeResult(audio_bytes=audio_bytes, media_type=media_type, provider=provider)

    if provider in {PRIMARY_QWEN_PROVIDER, LEGACY_COSYVOICE_PROVIDER}:
        settings = get_settings()
        payload = gpt_sovits_payload or {}
        override_voice_id = str(
            payload.get("_qwen_voice_id_override") or payload.get("_cosyvoice_voice_id_override") or ""
        ).strip()
        override_model = str(
            payload.get("_qwen_target_model_override") or payload.get("_cosyvoice_target_model_override") or ""
        ).strip()
        try:
            voice_id = override_voice_id or _resolve_qwen_voice_id(allow_auto_enroll=True)
            if not voice_id:
                raise TTSServiceError(
                    "未找到可用千问 voice_id。请先调用 /v1/tts/qwen/enroll（或兼容路由 /v1/tts/cosyvoice/enroll），"
                    "或配置 QWEN_VOICE_ID/COSYVOICE_VOICE_ID。"
                )
            target_model = override_model or settings.cosyvoice_target_model
            audio_bytes, media_type = synthesize_qwen_clone_tts(
                text,
                model=target_model,
                voice_id=voice_id,
            )
        except (QwenVoiceClientError, TTSServiceError) as exc:
            raise TTSServiceError(str(exc)) from exc
        return TTSSynthesizeResult(
            audio_bytes=audio_bytes,
            media_type=media_type,
            provider=PRIMARY_QWEN_PROVIDER,
            voice_id=voice_id,
        )

    raise TTSServiceError(f"不支持的 TTS provider: {provider}")


def _resolve_qwen_voice_id(*, allow_auto_enroll: bool) -> str:
    settings = get_settings()
    explicit = settings.cosyvoice_voice_id.strip()
    if explicit:
        return explicit

    alias_entry = cosyvoice_registry.get_voice_entry(settings.cosyvoice_voice_alias)
    if alias_entry:
        cached_id = str(alias_entry.get("voice_id", "")).strip()
        if cached_id:
            return cached_id

    voices = list_voices(prefix=settings.cosyvoice_voice_prefix, page_index=0, page_size=50)
    if voices:
        picked = str(voices[0].get("voice", "")).strip()
        model = str(voices[0].get("target_model", settings.cosyvoice_target_model)).strip()
        if picked:
            cosyvoice_registry.upsert_voice_entry(
                settings.cosyvoice_voice_alias,
                {
                    "voice_id": picked,
                    "target_model": model or settings.cosyvoice_target_model,
                    "status": "OK",
                    "source": "list_voices",
                    "updated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                },
            )
            return picked

    if not allow_auto_enroll or not settings.cosyvoice_auto_enroll:
        return ""
    if not settings.cosyvoice_enroll_audio_url.strip():
        return ""

    result = enroll_or_reuse_qwen_voice(wait_ready=True)
    return result.voice_id


def _resolve_cosyvoice_voice_id(*, allow_auto_enroll: bool) -> str:
    return _resolve_qwen_voice_id(allow_auto_enroll=allow_auto_enroll)

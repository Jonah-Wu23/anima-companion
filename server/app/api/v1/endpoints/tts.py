"""TTS 代理接口。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response

from app.schemas.tts import (
    CosyVoiceEnrollRequest,
    CosyVoiceEnrollResponse,
    QwenVoiceEnrollRequest,
    QwenVoiceEnrollResponse,
    TTSSynthesizeRequest,
)
from app.services.tts.tts_service import (
    TTSServiceError,
    delete_qwen_voice,
    enroll_or_reuse_qwen_voice,
    enroll_or_reuse_cosyvoice_voice,
    list_qwen_voices,
    list_cosyvoice_voices,
    probe_tts_providers,
    synthesize_with_fallback,
)

router = APIRouter(prefix="/v1/tts", tags=["tts"])


@router.get("/providers")
def get_tts_providers() -> dict[str, object]:
    return {"providers": probe_tts_providers()}


@router.post("/synthesize")
def synthesize_audio(req: TTSSynthesizeRequest) -> Response:
    payload = req.model_dump(exclude_none=True)
    text = str(payload.pop("text", "")).strip()
    if not text:
        raise HTTPException(status_code=400, detail="text 不能为空")

    provider = str(payload.pop("provider", "auto")).strip().lower() or "auto"
    qwen_voice_id = str(payload.pop("qwen_voice_id", "")).strip()
    qwen_target_model = str(payload.pop("qwen_target_model", "")).strip()
    cosyvoice_voice_id = str(payload.pop("cosyvoice_voice_id", "")).strip()
    cosyvoice_target_model = str(payload.pop("cosyvoice_target_model", "")).strip()
    gpt_payload = dict(payload)
    gpt_payload["text"] = text

    if provider in {"qwen_clone_tts", "cosyvoice_tts"}:
        effective_voice_id = qwen_voice_id or cosyvoice_voice_id
        effective_target_model = qwen_target_model or cosyvoice_target_model
        if effective_voice_id:
            gpt_payload["_qwen_voice_id_override"] = effective_voice_id
        if effective_target_model:
            gpt_payload["_qwen_target_model_override"] = effective_target_model

    if provider == "gpt_sovits":
        gpt_payload["__force_provider"] = "gpt_sovits"
    elif provider == "qwen_clone_tts":
        gpt_payload["__force_provider"] = "qwen_clone_tts"
    elif provider == "cosyvoice_tts":
        # 兼容旧 provider 名称。
        gpt_payload["__force_provider"] = "cosyvoice_tts"

    try:
        result = synthesize_with_fallback(
            text=text,
            gpt_sovits_payload=gpt_payload,
        )
        headers = {"X-TTS-Provider": result.provider}
        if result.voice_id:
            headers["X-Qwen-Voice-ID"] = result.voice_id
            # 兼容旧头名。
            headers["X-CosyVoice-Voice-ID"] = result.voice_id
        return Response(content=result.audio_bytes, media_type=result.media_type, headers=headers)
    except TTSServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/qwen/enroll", response_model=QwenVoiceEnrollResponse)
def qwen_enroll(req: QwenVoiceEnrollRequest) -> QwenVoiceEnrollResponse:
    try:
        result = enroll_or_reuse_qwen_voice(
            audio_url=req.audio_url,
            prefix=req.prefix,
            target_model=req.target_model,
            language_hints=req.language_hints,
            wait_ready=req.wait_ready,
        )
        return QwenVoiceEnrollResponse(
            voice_id=result.voice_id,
            status=result.status,
            target_model=result.target_model,
            reused=result.reused,
        )
    except TTSServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/qwen/voices")
def qwen_voices(
    prefix: str | None = Query(default=None),
    page_index: int = Query(default=0, ge=0),
    page_size: int = Query(default=10, ge=1, le=100),
) -> dict[str, object]:
    try:
        voices = list_qwen_voices(prefix=prefix, page_index=page_index, page_size=page_size)
        return {"voices": voices}
    except TTSServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/qwen/voice")
def qwen_delete_voice(voice_id: str = Query(..., min_length=1)) -> dict[str, bool]:
    try:
        delete_qwen_voice(voice_id)
        return {"ok": True}
    except TTSServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/cosyvoice/enroll", response_model=CosyVoiceEnrollResponse)
def cosyvoice_enroll(req: CosyVoiceEnrollRequest) -> CosyVoiceEnrollResponse:
    # 兼容旧路由：底层已切换到千问复刻链路。
    try:
        result = enroll_or_reuse_cosyvoice_voice(
            audio_url=req.audio_url,
            prefix=req.prefix,
            target_model=req.target_model,
            language_hints=req.language_hints,
            wait_ready=req.wait_ready,
        )
        return CosyVoiceEnrollResponse(
            voice_id=result.voice_id,
            status=result.status,
            target_model=result.target_model,
            reused=result.reused,
        )
    except TTSServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/cosyvoice/voices")
def cosyvoice_voices(
    prefix: str | None = Query(default=None),
    page_index: int = Query(default=0, ge=0),
    page_size: int = Query(default=10, ge=1, le=100),
) -> dict[str, object]:
    # 兼容旧路由：底层已切换到千问复刻链路。
    try:
        voices = list_cosyvoice_voices(prefix=prefix, page_index=page_index, page_size=page_size)
        return {"voices": voices}
    except TTSServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

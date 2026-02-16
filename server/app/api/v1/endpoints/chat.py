"""聊天接口。"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.dependencies import get_session_store
from app.repositories.session_store import SessionStore
from app.schemas.chat import ChatTextRequest, ChatTextResponse, ChatTextVoiceResponse, ChatVoiceResponse
from app.services.asr.asr_service import ASRServiceError, ASRUnavailableError, transcribe_with_fallback
from app.services.dialogue.chat_service import (
    ChatServiceError,
    run_text_chat,
    synthesize_assistant_audio_base64,
)

router = APIRouter(prefix="/v1/chat", tags=["chat"])
logger = logging.getLogger(__name__)


@router.post("/text", response_model=ChatTextResponse)
def chat_text(
    req: ChatTextRequest,
    store: SessionStore = Depends(get_session_store),
) -> ChatTextResponse:
    try:
        result = run_text_chat(
            store=store,
            session_id=req.session_id,
            persona_id=req.persona_id,
            user_text=req.user_text,
        )
    except ChatServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ChatTextResponse(**result)


@router.post("/text-with-voice", response_model=ChatTextVoiceResponse)
def chat_text_with_voice(
    req: ChatTextRequest,
    store: SessionStore = Depends(get_session_store),
) -> ChatTextVoiceResponse:
    try:
        result = run_text_chat(
            store=store,
            session_id=req.session_id,
            persona_id=req.persona_id,
            user_text=req.user_text,
        )
    except ChatServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    tts_media_type = "audio/wav"
    tts_audio_base64 = ""
    tts_provider: str | None = None
    tts_error: str | None = None
    try:
        tts_media_type, tts_audio_base64, tts_provider = synthesize_assistant_audio_base64(
            str(result.get("assistant_raw_text", result["assistant_text"])),
            force_tts_provider=req.tts_provider,
            qwen_voice_id=req.qwen_voice_id,
            qwen_target_model=req.qwen_target_model,
        )
    except ChatServiceError as exc:
        tts_error = str(exc)
        logger.warning("text-with-voice TTS 合成失败，降级为纯文本返回: %s", exc)

    return ChatTextVoiceResponse(
        session_id=result["session_id"],
        assistant_text=result["assistant_text"],
        emotion=result["emotion"],
        animation=result["animation"],
        relationship_delta=result["relationship_delta"],
        memory_writes=result["memory_writes"],
        tts_media_type=tts_media_type,
        tts_audio_base64=tts_audio_base64,
        tts_error=tts_error,
        tts_provider=tts_provider,
    )


@router.post("/voice", response_model=ChatVoiceResponse)
async def chat_voice(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    persona_id: str = Form(...),
    lang: str | None = Form(None),
    requested_tts_provider: str = Form("qwen_clone_tts", alias="tts_provider"),
    qwen_voice_id: str = Form(""),
    qwen_target_model: str = Form(""),
    store: SessionStore = Depends(get_session_store),
) -> ChatVoiceResponse:
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="audio 不能为空")

    try:
        asr_result = transcribe_with_fallback(
            audio_bytes=audio_bytes,
            filename=audio.filename or "voice.wav",
            lang=lang,
        )
        transcript = asr_result.text
        logger.info("ASR provider selected: %s", asr_result.provider)
    except ASRUnavailableError as exc:
        logger.warning("ASR 全量不可用，建议切换文本输入: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ASRServiceError as exc:
        logger.warning("ASR 转写失败: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        text_result = run_text_chat(
            store=store,
            session_id=session_id,
            persona_id=persona_id,
            user_text=transcript,
        )
    except ChatServiceError as exc:
        logger.warning("LLM 对话失败: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM 对话失败: {exc}") from exc

    tts_media_type = "audio/wav"
    tts_audio_base64 = ""
    resolved_tts_provider: str | None = None
    tts_error: str | None = None
    try:
        tts_media_type, tts_audio_base64, resolved_tts_provider = synthesize_assistant_audio_base64(
            str(text_result.get("assistant_raw_text", text_result["assistant_text"])),
            force_tts_provider=requested_tts_provider,
            qwen_voice_id=qwen_voice_id,
            qwen_target_model=qwen_target_model,
        )
    except ChatServiceError as exc:
        tts_error = str(exc)
        logger.warning("TTS 合成失败，降级为纯文本返回: %s", exc)

    return ChatVoiceResponse(
        transcript_text=transcript,
        asr_provider=asr_result.provider,
        assistant_text=text_result["assistant_text"],
        tts_media_type=tts_media_type,
        tts_audio_base64=tts_audio_base64,
        tts_error=tts_error,
        tts_provider=resolved_tts_provider,
        emotion=text_result["emotion"],
        animation=text_result["animation"],
    )

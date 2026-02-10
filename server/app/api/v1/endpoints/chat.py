"""聊天接口。"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.dependencies import get_session_store
from app.repositories.session_store import SessionStore
from app.schemas.chat import ChatTextRequest, ChatTextResponse, ChatVoiceResponse
from app.services.asr.sensevoice_client import SenseVoiceClientError, transcribe_wav
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


@router.post("/voice", response_model=ChatVoiceResponse)
async def chat_voice(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    persona_id: str = Form(...),
    lang: str | None = Form(None),
    store: SessionStore = Depends(get_session_store),
) -> ChatVoiceResponse:
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="audio 不能为空")

    try:
        transcript = transcribe_wav(audio_bytes, audio.filename or "voice.wav", lang=lang)
    except SenseVoiceClientError as exc:
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
    tts_error: str | None = None
    try:
        tts_media_type, tts_audio_base64 = synthesize_assistant_audio_base64(
            text_result["assistant_text"]
        )
    except ChatServiceError as exc:
        tts_error = str(exc)
        logger.warning("TTS 合成失败，降级为纯文本返回: %s", exc)

    return ChatVoiceResponse(
        transcript_text=transcript,
        assistant_text=text_result["assistant_text"],
        tts_media_type=tts_media_type,
        tts_audio_base64=tts_audio_base64,
        tts_error=tts_error,
        emotion=text_result["emotion"],
        animation=text_result["animation"],
    )

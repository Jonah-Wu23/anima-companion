"""TTS 代理接口。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from app.schemas.tts import TTSSynthesizeRequest
from app.services.tts.gpt_sovits_client import GPTSoVITSClientError, synthesize

router = APIRouter(prefix="/v1/tts", tags=["tts"])


@router.post("/synthesize")
def synthesize_audio(req: TTSSynthesizeRequest) -> Response:
    try:
        payload = req.model_dump(exclude_none=True)
        audio_bytes, media_type = synthesize(payload)
        return Response(content=audio_bytes, media_type=media_type)
    except GPTSoVITSClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


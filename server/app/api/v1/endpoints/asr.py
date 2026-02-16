"""ASR 相关接口。"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.settings import get_settings
from app.services.asr.asr_service import probe_asr_providers
from app.services.asr.fun_asr_realtime_client import FunASRClientError, FunASRRealtimeSession

router = APIRouter(prefix="/v1/asr", tags=["asr"])
logger = logging.getLogger(__name__)


@router.get("/providers")
def get_asr_providers() -> dict[str, Any]:
    return {"providers": probe_asr_providers()}


@router.websocket("/fun/realtime/ws")
async def fun_asr_realtime_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    settings = get_settings()
    fmt = (websocket.query_params.get("format") or settings.fun_asr_format).strip().lower()
    sample_rate = _to_int(websocket.query_params.get("sample_rate"), settings.fun_asr_sample_rate)

    session = FunASRRealtimeSession(audio_format=fmt, sample_rate=sample_rate)
    forward_task: asyncio.Task[None] | None = None
    stop_forward = asyncio.Event()

    try:
        session.start()
        await websocket.send_json(
            {
                "type": "open",
                "provider": "fun_asr_realtime",
                "format": fmt,
                "sample_rate": sample_rate,
            }
        )
        forward_task = asyncio.create_task(_forward_asr_events(websocket, session, stop_forward))

        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            binary = message.get("bytes")
            if isinstance(binary, (bytes, bytearray)):
                session.send_audio_frame(bytes(binary))
                continue

            text = str(message.get("text", "") or "").strip().lower()
            if text in {"stop", "[done]", "end"}:
                break

        session.stop()
    except WebSocketDisconnect:
        logger.info("Fun-ASR WebSocket 客户端断开连接")
    except FunASRClientError as exc:
        await websocket.send_json({"type": "error", "provider": "fun_asr_realtime", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        logger.exception("Fun-ASR WebSocket 会话异常: %s", exc)
        try:
            await websocket.send_json({"type": "error", "provider": "fun_asr_realtime", "message": str(exc)})
        except Exception:  # noqa: BLE001
            pass
    finally:
        stop_forward.set()
        if forward_task is not None:
            try:
                await asyncio.wait_for(forward_task, timeout=2.0)
            except asyncio.TimeoutError:
                forward_task.cancel()
        session.close()
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


@router.get("/fun/realtime/usage")
def get_fun_asr_realtime_usage_guide() -> dict[str, Any]:
    settings = get_settings()
    return {
        "provider": "fun_asr_realtime",
        "transport": "websocket",
        "endpoint": "/v1/asr/fun/realtime/ws",
        "recommended_audio": {
            "format": settings.fun_asr_format,
            "sample_rate": settings.fun_asr_sample_rate,
            "frame_duration_ms": 100,
            "frame_size_hint": "1KB-16KB",
        },
        "protocol": {
            "client_to_server": [
                "binary: 音频帧（推荐100ms）",
                "text: stop/[done]/end 表示结束",
            ],
            "server_to_client": [
                "open: 会话建立完成",
                "result: 增量识别结果（含 sentence_end）",
                "error: 异常信息",
                "complete/close: 识别结束",
            ],
        },
    }


async def _forward_asr_events(
    websocket: WebSocket,
    session: FunASRRealtimeSession,
    stop_event: asyncio.Event,
) -> None:
    while not stop_event.is_set():
        event = await asyncio.to_thread(session.poll_event, 0.2)
        if event is None:
            continue
        payload = {
            "type": event.type,
            "provider": "fun_asr_realtime",
            "text": event.text,
            "sentence_end": event.sentence_end,
            "request_id": event.request_id,
            "usage": event.usage,
            "error": event.error,
        }
        await websocket.send_json(payload)
        if event.type in {"error", "complete", "close"} and stop_event.is_set():
            return


def _to_int(value: str | None, fallback: int) -> int:
    if value is None:
        return fallback
    try:
        return int(value)
    except ValueError:
        return fallback

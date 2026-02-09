"""v1 路由聚合。"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints.tts import router as tts_router

api_router = APIRouter()
api_router.include_router(tts_router)


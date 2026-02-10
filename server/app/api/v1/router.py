"""v1 路由聚合。"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints.chat import router as chat_router
from app.api.v1.endpoints.tts import router as tts_router
from app.api.v1.endpoints.user import router as user_router

api_router = APIRouter()
api_router.include_router(chat_router)
api_router.include_router(tts_router)
api_router.include_router(user_router)

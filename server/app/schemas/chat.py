"""聊天与语音协议。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Emotion = Literal["neutral", "happy", "sad", "angry", "shy"]
Animation = Literal["idle", "listen", "think", "speak", "happy", "sad", "angry"]
MemoryType = Literal["preference", "taboo", "important_names", "note"]


class RelationshipDelta(BaseModel):
    trust: int = 0
    reliance: int = 0
    fatigue: int = 0


class MemoryWrite(BaseModel):
    key: str = Field(..., min_length=1)
    value: str = Field(..., min_length=1)
    type: MemoryType = "note"


class ChatTextRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    persona_id: str = Field(..., min_length=1)
    user_text: str = Field(..., min_length=1)


class ChatTextResponse(BaseModel):
    session_id: str
    assistant_text: str
    emotion: Emotion = "neutral"
    animation: Animation = "speak"
    relationship_delta: RelationshipDelta = Field(default_factory=RelationshipDelta)
    memory_writes: list[MemoryWrite] = Field(default_factory=list)


class ChatVoiceResponse(BaseModel):
    transcript_text: str
    assistant_text: str
    tts_media_type: str
    tts_audio_base64: str
    tts_error: str | None = None
    emotion: Emotion = "neutral"
    animation: Animation = "speak"


class UserClearRequest(BaseModel):
    session_id: str = Field(..., min_length=1)


class UserClearResponse(BaseModel):
    ok: bool = True

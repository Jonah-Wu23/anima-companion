"""TTS 请求协议。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

LanguageCode = Literal["zh", "en", "ja"]


class TTSSynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, description="要合成的文本")
    text_lang: LanguageCode = Field("zh", description="文本语言")
    ref_audio_path: str = Field(..., min_length=1, description="参考音频路径（相对 GPT-SoVITS 根目录）")
    prompt_lang: LanguageCode = Field("zh", description="参考文本语言")
    prompt_text: str = Field("", description="参考音频对应文本")
    text_split_method: str = Field("cut5", description="切句策略")
    speed_factor: float = Field(1.0, description="语速倍率")
    top_k: int = Field(5, ge=1, le=100)
    top_p: float = Field(1.0, ge=0.0, le=1.0)
    temperature: float = Field(1.0, ge=0.0, le=2.0)
    batch_size: int = Field(1, ge=1, le=20)
    media_type: Literal["wav", "raw", "ogg", "aac"] = "wav"
    streaming_mode: bool = False


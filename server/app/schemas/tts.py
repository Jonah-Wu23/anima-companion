"""TTS 请求协议。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

LanguageCode = Literal["zh", "en", "ja"]


class TTSSynthesizeRequest(BaseModel):
    provider: Literal["auto", "gpt_sovits", "qwen_clone_tts", "cosyvoice_tts"] = "auto"
    text: str = Field(..., min_length=1, description="要合成的文本")
    text_lang: LanguageCode = Field("zh", description="文本语言")
    ref_audio_path: str = Field("", description="参考音频路径（相对 GPT-SoVITS 根目录）")
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
    qwen_voice_id: str = Field("", description="指定千问复刻 voice（可选）")
    qwen_target_model: str = Field("", description="指定千问 TTS 模型（可选）")
    # 兼容旧字段名（等价于 qwen_*）。
    cosyvoice_voice_id: str = Field("", description="指定 CosyVoice voice_id（可选）")
    cosyvoice_target_model: str = Field("", description="指定 CosyVoice model（可选）")


class CosyVoiceEnrollRequest(BaseModel):
    audio_url: str = Field("", description="公网可访问音频 URL")
    prefix: str = Field("", description="音色前缀（数字+小写字母，<=10）")
    target_model: str = Field("", description="目标模型（需与合成保持一致）")
    wait_ready: bool = Field(True, description="是否阻塞等待审核完成")
    language_hints: list[str] = Field(default_factory=lambda: ["zh"])


class CosyVoiceEnrollResponse(BaseModel):
    voice_id: str
    status: str
    target_model: str
    reused: bool


class QwenVoiceEnrollRequest(BaseModel):
    audio_url: str = Field("", description="公网可访问音频 URL")
    prefix: str = Field("", description="音色前缀（字母/数字/下划线，<=16）")
    target_model: str = Field("", description="目标模型（需与合成保持一致）")
    wait_ready: bool = Field(True, description="是否阻塞等待音色可用")
    language_hints: list[str] = Field(default_factory=lambda: ["zh"])


class QwenVoiceEnrollResponse(BaseModel):
    voice_id: str
    status: str
    target_model: str
    reused: bool

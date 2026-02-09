"""服务端运行时配置。"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _to_float(value: str, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


@dataclass(frozen=True)
class Settings:
    gpt_sovits_base_url: str = os.getenv("GPT_SOVITS_BASE_URL", "http://127.0.0.1:9880")
    gpt_sovits_timeout_seconds: float = _to_float(
        os.getenv("GPT_SOVITS_TIMEOUT_SECONDS", "60"),
        60.0,
    )


settings = Settings()


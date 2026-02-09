"""GPT-SoVITS HTTP 客户端封装。"""

from __future__ import annotations

import json
from typing import Any
from urllib import error, request

from app.core.settings import settings


class GPTSoVITSClientError(RuntimeError):
    """GPT-SoVITS 接口请求失败。"""


def synthesize(payload: dict[str, Any]) -> tuple[bytes, str]:
    """调用 GPT-SoVITS /tts 并返回音频二进制与媒体类型。"""
    url = f"{settings.gpt_sovits_base_url.rstrip('/')}/tts"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        url=url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with request.urlopen(req, timeout=settings.gpt_sovits_timeout_seconds) as resp:
            raw = resp.read()
            media_type = resp.headers.get("Content-Type", "audio/wav")
            if media_type.startswith("application/json"):
                message = raw.decode("utf-8", errors="ignore")
                raise GPTSoVITSClientError(f"GPT-SoVITS 返回错误: {message}")
            return raw, media_type
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise GPTSoVITSClientError(f"HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise GPTSoVITSClientError(f"无法连接 GPT-SoVITS: {exc.reason}") from exc


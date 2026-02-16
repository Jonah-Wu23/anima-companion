"""千问声音复刻 + 语音合成封装。"""

from __future__ import annotations

import base64
import io
import json
import re
import threading
import time
import wave
from typing import Any

import httpx

from app.core.settings import get_settings

QWEN_VOICE_ENROLLMENT_MODEL = "qwen-voice-enrollment"
DEFAULT_QWEN_CUSTOMIZATION_URL = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"
DEFAULT_QWEN_REALTIME_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
VOICE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{1,16}$")


class QwenVoiceClientError(RuntimeError):
    """千问声音复刻或合成失败。"""


class _RealtimeAudioCollector:
    def __init__(self) -> None:
        self._done = threading.Event()
        self.pcm_audio = bytearray()
        self.error_text = ""

    def on_open(self) -> None:
        return

    def on_close(self, close_status_code: int, close_msg: str) -> None:
        _ = close_status_code, close_msg

    def on_event(self, response: dict[str, Any]) -> None:
        event_type = str(response.get("type", "")).strip()
        if event_type == "response.audio.delta":
            chunk = str(response.get("delta", ""))
            if chunk:
                try:
                    self.pcm_audio.extend(base64.b64decode(chunk))
                except Exception as exc:  # noqa: BLE001
                    self.error_text = f"realtime 音频解码失败: {exc}"
                    self._done.set()
            return
        if event_type == "error":
            self.error_text = json.dumps(response, ensure_ascii=False)
            self._done.set()
            return
        if event_type == "session.finished":
            self._done.set()

    def wait_done(self, timeout_seconds: float) -> bool:
        return self._done.wait(timeout_seconds)


def synthesize(text: str, *, model: str, voice_id: str) -> tuple[bytes, str]:
    settings = get_settings()
    api_key = settings.dashscope_api_key.strip()
    if not api_key:
        raise QwenVoiceClientError("未配置 DASHSCOPE_API_KEY")
    if not voice_id.strip():
        raise QwenVoiceClientError("voice_id 为空，无法调用千问语音合成")
    clean_text = str(text or "").strip()
    if not clean_text:
        raise QwenVoiceClientError("text 不能为空")

    chosen_model = str(model or "").strip()
    if not chosen_model:
        raise QwenVoiceClientError("model 不能为空")

    if "realtime" not in chosen_model.lower():
        return _synthesize_non_realtime(
            text=clean_text,
            model=chosen_model,
            voice_id=voice_id.strip(),
            api_key=api_key,
        )

    try:
        import dashscope  # type: ignore
        from dashscope.audio.qwen_tts_realtime import (  # type: ignore
            AudioFormat,
            QwenTtsRealtime,
            QwenTtsRealtimeCallback,
        )
    except ImportError as exc:  # pragma: no cover - 依赖环境
        raise QwenVoiceClientError("dashscope SDK 缺少 qwen_tts_realtime 依赖") from exc

    dashscope.api_key = api_key
    collector = _RealtimeAudioCollector()

    class _Callback(QwenTtsRealtimeCallback):
        def on_open(self) -> None:
            collector.on_open()

        def on_close(self, close_status_code: int, close_msg: str) -> None:
            collector.on_close(close_status_code, close_msg)

        def on_event(self, response: dict[str, Any]) -> None:
            collector.on_event(response)

    client = QwenTtsRealtime(
        model=chosen_model,
        callback=_Callback(),
        url=settings.qwen_tts_realtime_ws_url.strip() or DEFAULT_QWEN_REALTIME_WS_URL,
    )
    try:
        client.connect()
        client.update_session(
            voice=voice_id.strip(),
            response_format=AudioFormat.PCM_24000HZ_MONO_16BIT,
            mode="server_commit",
        )
        client.append_text(clean_text)
        client.finish()
        if not collector.wait_done(timeout_seconds=max(settings.provider_probe_timeout_seconds * 20, 30.0)):
            raise QwenVoiceClientError("等待 realtime 合成超时（未收到 session.finished）")
        if collector.error_text:
            raise QwenVoiceClientError(f"realtime 合成失败: {collector.error_text}")
        if not collector.pcm_audio:
            raise QwenVoiceClientError("realtime 未返回音频数据")
        wav_bytes = _pcm16_mono_24k_to_wav_bytes(bytes(collector.pcm_audio))
        return wav_bytes, "audio/wav"
    except Exception as exc:  # noqa: BLE001
        if isinstance(exc, QwenVoiceClientError):
            raise
        raise QwenVoiceClientError(f"千问 realtime 合成失败: {exc}") from exc
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            try:
                close()
            except Exception:  # noqa: BLE001
                pass


def create_voice(
    *,
    target_model: str,
    prefix: str,
    url: str,
    language_hints: list[str] | None = None,
) -> str:
    _ = language_hints  # 千问 create 接口目前按 language 字段单值可选，这里暂不强依赖。
    preferred_name = _normalize_preferred_name(prefix)
    if not preferred_name:
        raise QwenVoiceClientError("声音复刻 preferred_name 不合法（仅数字/字母/下划线，<=16）")
    audio_url = str(url or "").strip()
    if not audio_url:
        raise QwenVoiceClientError("创建音色需要公网可访问的音频 URL")

    response = _post_customization(
        {
            "action": "create",
            "target_model": target_model.strip(),
            "preferred_name": preferred_name,
            "audio": {"data": audio_url},
        }
    )
    output = response.get("output", {})
    if not isinstance(output, dict):
        raise QwenVoiceClientError("创建音色响应缺少 output")
    voice = str(output.get("voice", "")).strip()
    if not voice:
        raise QwenVoiceClientError("创建音色成功但未返回 voice")
    return voice


def delete_voice(*, voice_id: str) -> None:
    voice = str(voice_id or "").strip()
    if not voice:
        raise QwenVoiceClientError("删除音色时 voice_id 不能为空")
    _post_customization(
        {
            "action": "delete",
            "voice": voice,
        }
    )


def list_voices(prefix: str | None = None, page_index: int = 0, page_size: int = 10) -> list[dict[str, Any]]:
    response = _post_customization(
        {
            "action": "list",
            "page_index": max(page_index, 0),
            "page_size": max(page_size, 1),
        }
    )
    output = response.get("output", {})
    voice_list = output.get("voice_list", []) if isinstance(output, dict) else []
    if not isinstance(voice_list, list):
        return []
    records = [item for item in voice_list if isinstance(item, dict)]
    if not prefix:
        return records
    key = str(prefix).strip()
    if not key:
        return records
    return [item for item in records if key in str(item.get("voice", ""))]


def query_voice(voice_id: str) -> dict[str, Any]:
    voice = str(voice_id or "").strip()
    if not voice:
        raise QwenVoiceClientError("voice_id 为空")

    # 千问接口没有单独 query，采用分页 list 做近似查询。
    for page in range(0, 20):
        items = list_voices(page_index=page, page_size=100)
        if not items:
            break
        for item in items:
            if str(item.get("voice", "")).strip() == voice:
                merged = dict(item)
                merged.setdefault("status", "OK")
                return merged
    raise QwenVoiceClientError(f"未查询到音色: {voice}")


def wait_voice_ready(voice_id: str, *, poll_interval_seconds: float, max_attempts: int) -> dict[str, Any]:
    attempts = max(int(max_attempts), 1)
    interval = max(float(poll_interval_seconds), 0.5)
    last_error = ""
    for _ in range(attempts):
        try:
            detail = query_voice(voice_id)
            status = str(detail.get("status", "OK")).upper()
            if status in {"OK", "READY"}:
                detail["status"] = "OK"
                return detail
        except QwenVoiceClientError as exc:
            last_error = str(exc)
        time.sleep(interval)
    raise QwenVoiceClientError(f"等待千问音色可用超时: {last_error or voice_id}")


def probe_qwen_ready() -> tuple[bool, str]:
    settings = get_settings()
    if not settings.dashscope_api_key.strip():
        return False, "DASHSCOPE_API_KEY 未配置"
    try:
        import dashscope  # type: ignore  # noqa: F401
        from dashscope.audio.qwen_tts_realtime import QwenTtsRealtime  # type: ignore  # noqa: F401
    except ImportError as exc:
        return False, f"dashscope qwen_tts_realtime 不可用: {exc}"
    return True, "ok"


def _post_customization(payload_input: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    api_key = settings.dashscope_api_key.strip()
    if not api_key:
        raise QwenVoiceClientError("未配置 DASHSCOPE_API_KEY")
    endpoint = settings.qwen_voice_customization_url.strip() or DEFAULT_QWEN_CUSTOMIZATION_URL
    payload = {
        "model": QWEN_VOICE_ENROLLMENT_MODEL,
        "input": payload_input,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(endpoint, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise QwenVoiceClientError(f"千问声音复刻请求失败: {exc}") from exc

    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.status_code != 200:
        request_id = str(data.get("request_id", "")).strip() if isinstance(data, dict) else ""
        suffix = f" request_id={request_id}" if request_id else ""
        raise QwenVoiceClientError(
            f"千问声音复刻接口返回非200: status={response.status_code}{suffix} body={response.text}"
        )
    if not isinstance(data, dict):
        raise QwenVoiceClientError("千问声音复刻响应格式异常")
    return data


def _normalize_preferred_name(prefix: str) -> str:
    text = str(prefix or "").strip()
    if not text:
        return ""
    text = text[:16]
    if VOICE_NAME_PATTERN.fullmatch(text):
        return text
    return ""


def _pcm16_mono_24k_to_wav_bytes(pcm_audio: bytes) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(pcm_audio)
    return buffer.getvalue()


def _synthesize_non_realtime(*, text: str, model: str, voice_id: str, api_key: str) -> tuple[bytes, str]:
    settings = get_settings()
    try:
        import dashscope  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise QwenVoiceClientError("未安装 dashscope SDK，无法调用千问非实时合成") from exc

    customization_url = settings.qwen_voice_customization_url.strip() or DEFAULT_QWEN_CUSTOMIZATION_URL
    if "dashscope-intl.aliyuncs.com" in customization_url:
        dashscope.base_http_api_url = "https://dashscope-intl.aliyuncs.com/api/v1"
    else:
        dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

    try:
        response = dashscope.MultiModalConversation.call(
            model=model,
            api_key=api_key,
            text=text,
            voice=voice_id,
            stream=False,
        )
    except Exception as exc:  # noqa: BLE001
        raise QwenVoiceClientError(f"千问非实时合成调用失败: {exc}") from exc

    audio_url = _extract_audio_url(response)
    if not audio_url:
        raise QwenVoiceClientError(f"千问非实时合成未返回音频 URL: {response}")

    try:
        with httpx.Client(timeout=60.0) as client:
            audio_resp = client.get(audio_url)
            audio_resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise QwenVoiceClientError(f"下载合成音频失败: {exc}") from exc

    media_type = audio_resp.headers.get("content-type", "audio/wav").split(";")[0].strip() or "audio/wav"
    return audio_resp.content, media_type


def _extract_audio_url(response: Any) -> str:
    # dict 风格
    if isinstance(response, dict):
        output = response.get("output", {})
        if isinstance(output, dict):
            audio = output.get("audio", {})
            if isinstance(audio, dict):
                return str(audio.get("url", "")).strip()
        return ""

    # DashScope SDK 对象风格
    output_obj = getattr(response, "output", None)
    if output_obj is not None:
        audio_obj = getattr(output_obj, "audio", None)
        if audio_obj is not None:
            return str(getattr(audio_obj, "url", "")).strip()
    return ""

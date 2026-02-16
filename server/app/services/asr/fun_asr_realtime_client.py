"""Fun-ASR 实时识别 Python SDK 封装。"""

from __future__ import annotations

from dataclasses import dataclass
from queue import Empty, Queue
from threading import Event
from typing import Any

from app.core.settings import get_settings


class FunASRClientError(RuntimeError):
    """Fun-ASR 调用失败。"""


@dataclass
class FunASREvent:
    type: str
    text: str = ""
    sentence_end: bool = False
    request_id: str = ""
    usage: dict[str, Any] | None = None
    error: str = ""


def transcribe_audio_bytes_realtime(
    audio_bytes: bytes,
    *,
    audio_format: str,
    sample_rate: int,
) -> str:
    if not audio_bytes:
        raise FunASRClientError("空音频无法识别")

    session = FunASRRealtimeSession(
        audio_format=audio_format,
        sample_rate=sample_rate,
    )
    session.start()
    try:
        chunk_size = _resolve_chunk_size(sample_rate=sample_rate, audio_format=audio_format)
        for start in range(0, len(audio_bytes), chunk_size):
            session.send_audio_frame(audio_bytes[start : start + chunk_size])
        session.stop()
    finally:
        session.close()

    events: list[FunASREvent] = []
    while True:
        event = session.poll_event(timeout=0.01)
        if event is None:
            break
        if event.type == "error":
            raise FunASRClientError(event.error or "Fun-ASR 流式识别失败")
        events.append(event)

    merged = _merge_result_events(events)
    if not merged:
        raise FunASRClientError("Fun-ASR 未返回有效文本")
    return merged


class FunASRRealtimeSession:
    """面向 WebSocket 的 Fun-ASR 实时识别会话。"""

    def __init__(
        self,
        *,
        audio_format: str = "pcm",
        sample_rate: int = 16000,
    ) -> None:
        self._audio_format = audio_format
        self._sample_rate = sample_rate
        self._event_queue: Queue[FunASREvent] = Queue()
        self._recognition = None
        self._callback = None
        self._started = False
        self._stopped = False

    def start(self) -> None:
        if self._started:
            return

        dashscope, recognition_cls, callback_base, result_cls = _load_dashscope_sdk()
        settings = get_settings()
        api_key = settings.dashscope_api_key.strip()
        if not api_key:
            raise FunASRClientError("未配置 DASHSCOPE_API_KEY，无法启用 Fun-ASR")

        dashscope.api_key = api_key
        dashscope.base_websocket_api_url = settings.dashscope_base_websocket_api_url
        self._callback = _create_streaming_callback(
            callback_base=callback_base,
            result_cls=result_cls,
            event_queue=self._event_queue,
        )
        kwargs: dict[str, Any] = {
            "model": settings.fun_asr_model,
            "format": self._audio_format,
            "sample_rate": self._sample_rate,
            "semantic_punctuation_enabled": settings.fun_asr_semantic_punctuation_enabled,
            "max_sentence_silence": settings.fun_asr_max_sentence_silence,
            "multi_threshold_mode_enabled": settings.fun_asr_multi_threshold_mode_enabled,
            "heartbeat": settings.fun_asr_heartbeat,
            "callback": self._callback,
        }
        if settings.fun_asr_language_hints:
            kwargs["language_hints"] = list(settings.fun_asr_language_hints)
        if settings.fun_asr_vocabulary_id.strip():
            kwargs["vocabulary_id"] = settings.fun_asr_vocabulary_id.strip()
        if settings.fun_asr_speech_noise_threshold is not None:
            kwargs["speech_noise_threshold"] = settings.fun_asr_speech_noise_threshold

        try:
            self._recognition = recognition_cls(**kwargs)
            self._recognition.start()
            self._started = True
        except Exception as exc:  # noqa: BLE001 - 第三方 SDK 抛错类型不稳定
            raise FunASRClientError(f"启动 Fun-ASR 失败: {exc}") from exc

    def send_audio_frame(self, frame: bytes) -> None:
        if not self._started or self._recognition is None:
            raise FunASRClientError("Fun-ASR 会话尚未启动")
        if self._stopped:
            raise FunASRClientError("Fun-ASR 会话已停止")
        if not frame:
            return
        try:
            self._recognition.send_audio_frame(frame)
        except Exception as exc:  # noqa: BLE001
            raise FunASRClientError(f"发送音频帧失败: {exc}") from exc

    def stop(self) -> None:
        if not self._started or self._stopped:
            return
        self._stopped = True
        try:
            self._recognition.stop()
        except Exception as exc:  # noqa: BLE001
            raise FunASRClientError(f"停止 Fun-ASR 会话失败: {exc}") from exc

    def close(self) -> None:
        if not self._started:
            return
        if not self._stopped:
            try:
                self.stop()
            except FunASRClientError:
                pass
        self._started = False

    def poll_event(self, timeout: float = 0.0) -> FunASREvent | None:
        try:
            return self._event_queue.get(timeout=max(timeout, 0.0))
        except Empty:
            return None


def _create_streaming_callback(
    *,
    callback_base: Any,
    result_cls: Any,
    event_queue: Queue[FunASREvent],
) -> Any:
    class _StreamingRecognitionCallback(callback_base):  # type: ignore[misc, valid-type]
        def __init__(self) -> None:
            super().__init__()
            self._has_completed = Event()

        def on_open(self) -> None:
            event_queue.put(FunASREvent(type="open"))

        def on_close(self) -> None:
            event_queue.put(FunASREvent(type="close"))

        def on_complete(self) -> None:
            event_queue.put(FunASREvent(type="complete"))
            self._has_completed.set()

        def on_error(self, message: Any) -> None:
            request_id = str(getattr(message, "request_id", "") or "")
            error = str(getattr(message, "message", "") or "unknown error")
            event_queue.put(
                FunASREvent(
                    type="error",
                    request_id=request_id,
                    error=error,
                )
            )
            self._has_completed.set()

        def on_event(self, result: Any) -> None:
            try:
                sentence = result.get_sentence()
            except Exception:  # noqa: BLE001
                sentence = {}
            text = ""
            sentence_end = False
            usage: dict[str, Any] | None = None
            request_id = ""
            if isinstance(sentence, dict):
                text = str(sentence.get("text", "")).strip()
                try:
                    sentence_end = bool(result_cls.is_sentence_end(sentence))
                except Exception:  # noqa: BLE001
                    sentence_end = False
                try:
                    usage = result.get_usage(sentence)
                except Exception:  # noqa: BLE001
                    usage = None
            try:
                request_id = str(result.get_request_id() or "")
            except Exception:  # noqa: BLE001
                request_id = ""
            event_queue.put(
                FunASREvent(
                    type="result",
                    text=text,
                    sentence_end=sentence_end,
                    usage=usage,
                    request_id=request_id,
                )
            )

    return _StreamingRecognitionCallback()


def _resolve_chunk_size(*, sample_rate: int, audio_format: str) -> int:
    normalized = (audio_format or "").strip().lower()
    if normalized == "pcm":
        bytes_per_100ms = int(sample_rate * 2 * 0.1)  # 16-bit mono PCM
        return min(max(bytes_per_100ms, 1024), 16 * 1024)
    return 4 * 1024


def _merge_result_events(events: list[FunASREvent]) -> str:
    stable_segments: list[str] = []
    current_partial = ""
    last_non_empty = ""

    for event in events:
        if event.type != "result":
            continue
        text = str(event.text or "").strip()
        if not text:
            continue
        last_non_empty = text

        if event.sentence_end:
            candidate = _prefer_more_complete(current_partial, text)
            _append_stable_segment(stable_segments, candidate)
            current_partial = ""
        else:
            current_partial = _prefer_more_complete(current_partial, text)

    if current_partial:
        _append_stable_segment(stable_segments, current_partial)

    merged = "".join(stable_segments).strip()
    if not merged:
        return last_non_empty
    return merged


def _append_stable_segment(segments: list[str], candidate: str) -> None:
    text = str(candidate or "").strip()
    if not text:
        return
    if not segments:
        segments.append(text)
        return

    prev = segments[-1]
    if text == prev or text in prev:
        return
    if prev in text:
        segments[-1] = text
        return

    overlap = _longest_suffix_prefix_overlap(prev, text)
    if overlap > 0:
        segments[-1] = prev + text[overlap:]
    else:
        segments.append(text)


def _prefer_more_complete(existing: str, incoming: str) -> str:
    left = str(existing or "").strip()
    right = str(incoming or "").strip()
    if not left:
        return right
    if not right:
        return left
    if left == right:
        return left
    if right.startswith(left):
        return right
    if left.startswith(right):
        return left
    if right in left:
        return left
    if left in right:
        return right
    overlap = _longest_suffix_prefix_overlap(left, right)
    if overlap > 0:
        return left + right[overlap:]
    return right if len(right) >= len(left) else left


def _longest_suffix_prefix_overlap(left: str, right: str) -> int:
    max_len = min(len(left), len(right))
    for size in range(max_len, 0, -1):
        if left[-size:] == right[:size]:
            return size
    return 0


def _load_dashscope_sdk() -> tuple[Any, Any, Any, Any]:
    try:
        import dashscope  # type: ignore
        from dashscope.audio.asr import (  # type: ignore
            Recognition,
            RecognitionCallback,
            RecognitionResult,
        )
    except ImportError as exc:  # pragma: no cover - 由环境决定
        raise FunASRClientError(
            "未安装 dashscope SDK，请先安装后再启用 Fun-ASR"
        ) from exc
    return dashscope, Recognition, RecognitionCallback, RecognitionResult


def probe_fun_asr_ready() -> tuple[bool, str]:
    settings = get_settings()
    if not settings.dashscope_api_key.strip():
        return False, "DASHSCOPE_API_KEY 未配置"
    try:
        _load_dashscope_sdk()
    except FunASRClientError as exc:
        return False, str(exc)
    return True, "ok"

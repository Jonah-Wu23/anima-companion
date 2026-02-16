#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""千问声音复刻接口测试脚本（仅测试用途）。

默认流程：
1) 创建音色（action=create）
2) 查询音色列表（action=list）
3) 可选删除刚创建的音色（--cleanup）

说明：
- 音频默认使用已上传 OSS 的 URL。
- API Key 从 server/.env 读取（环境变量名默认 DASHSCOPE_API_KEY）。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import threading
import wave
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

MODEL_NAME = "qwen-voice-enrollment"
DEFAULT_AUDIO_URL = (
    "https://phainon-anima-companion.oss-cn-shanghai.aliyuncs.com/"
    "phainon_no_echo_merged.wav"
)
DEFAULT_TARGET_MODEL = "qwen3-tts-vc-realtime-2026-01-15"
URL_CN = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"
URL_INTL = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization"
WS_CN = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
WS_INTL = "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime"
PREFERRED_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{1,16}$")
DEFAULT_SYNTH_TEXT = "这是复刻音色实时合成测试。"


@dataclass(slots=True)
class ClientConfig:
    api_key: str
    endpoint: str
    timeout_seconds: float


class VoiceEnrollmentError(RuntimeError):
    """声音复刻接口调用失败。"""


class _RealtimeSynthesisCallback:
    """收集 realtime 合成回调中的 PCM 音频。"""

    def __init__(self) -> None:
        self._done = threading.Event()
        self.audio_bytes = bytearray()
        self.session_id = ""
        self.error_text = ""

    def on_open(self) -> None:
        print("[tts-realtime] 连接已建立")

    def on_close(self, close_status_code: int, close_msg: str) -> None:
        print(f"[tts-realtime] 连接关闭 code={close_status_code} msg={close_msg}")

    def on_event(self, response: dict[str, Any]) -> None:
        event_type = str(response.get("type", "")).strip()
        if event_type == "session.created":
            session = response.get("session", {})
            if isinstance(session, dict):
                self.session_id = str(session.get("id", ""))
            print(f"[tts-realtime] session.created session_id={self.session_id}")
            return

        if event_type == "response.audio.delta":
            delta = str(response.get("delta", ""))
            if delta:
                try:
                    self.audio_bytes.extend(base64.b64decode(delta))
                except Exception as exc:  # noqa: BLE001
                    self.error_text = f"音频片段解码失败: {exc}"
                    self._done.set()
            return

        if event_type == "response.done":
            print("[tts-realtime] response.done")
            return

        if event_type == "session.finished":
            print("[tts-realtime] session.finished")
            self._done.set()
            return

        if event_type == "error":
            self.error_text = json.dumps(response, ensure_ascii=False)
            print(f"[tts-realtime] error={self.error_text}")
            self._done.set()

    def wait_done(self, timeout_seconds: float) -> bool:
        return self._done.wait(timeout_seconds)


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="测试千问声音复刻接口")
    parser.add_argument(
        "--mode",
        choices=["run", "create", "list", "delete"],
        default="run",
        help="run=创建并查询；create=仅创建；list=仅查询；delete=仅删除。",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=repo_root / "server" / ".env",
        help="环境变量文件路径（默认 server/.env）。",
    )
    parser.add_argument(
        "--api-key-env",
        default="DASHSCOPE_API_KEY",
        help="API Key 的环境变量名（默认 DASHSCOPE_API_KEY）。",
    )
    parser.add_argument(
        "--region",
        choices=["cn", "intl"],
        default="cn",
        help="cn=中国内地；intl=国际站。",
    )
    parser.add_argument(
        "--target-model",
        default=DEFAULT_TARGET_MODEL,
        help="创建音色时绑定的 TTS 模型（后续合成需保持一致）。",
    )
    parser.add_argument(
        "--preferred-name",
        default="phainon",
        help="音色名称前缀（仅数字/字母/下划线，<=16）。",
    )
    parser.add_argument(
        "--audio-url",
        default=DEFAULT_AUDIO_URL,
        help="公网可访问音频 URL（用于 create）。",
    )
    parser.add_argument("--page-index", type=int, default=0, help="list 页码索引。")
    parser.add_argument("--page-size", type=int, default=10, help="list 每页条数。")
    parser.add_argument(
        "--delete-voice",
        default="",
        help="删除模式下指定要删除的 voice。",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="run 模式下创建成功后自动删除该音色。",
    )
    parser.add_argument(
        "--skip-synthesis",
        action="store_true",
        help="create/run 模式下跳过实时语音合成测试。",
    )
    parser.add_argument(
        "--synthesis-text",
        default=DEFAULT_SYNTH_TEXT,
        help="复刻完成后用于实时合成的一句话。",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=repo_root / "logs" / "qwen_voice_enrollment",
        help="实时合成音频输出目录。",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="HTTP 请求超时秒数。",
    )
    return parser.parse_args()


def build_client_config(args: argparse.Namespace) -> ClientConfig:
    load_dotenv(dotenv_path=args.env_file, override=False)
    api_key = os.getenv(args.api_key_env, "").strip()
    if not api_key:
        raise VoiceEnrollmentError(
            f"未读取到 API Key：{args.api_key_env}。请检查 {args.env_file} 或环境变量。"
        )
    endpoint = URL_CN if args.region == "cn" else URL_INTL
    return ClientConfig(api_key=api_key, endpoint=endpoint, timeout_seconds=float(args.timeout))


def post_customization(
    config: ClientConfig,
    payload_input: dict[str, Any],
) -> dict[str, Any]:
    payload = {
        "model": MODEL_NAME,
        "input": payload_input,
    }
    headers = {
        "Authorization": f"Bearer {config.api_key}",
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(
            config.endpoint,
            headers=headers,
            json=payload,
            timeout=config.timeout_seconds,
        )
    except requests.RequestException as exc:
        raise VoiceEnrollmentError(f"请求失败: {exc}") from exc

    text = response.text
    try:
        data = response.json()
    except ValueError:
        data = {}

    if response.status_code != 200:
        request_id = str(data.get("request_id", "")).strip()
        suffix = f" request_id={request_id}" if request_id else ""
        raise VoiceEnrollmentError(
            f"接口返回非 200：status={response.status_code}{suffix} body={text}"
        )
    if not isinstance(data, dict):
        raise VoiceEnrollmentError("接口响应不是 JSON 对象。")
    return data


def create_voice(config: ClientConfig, *, target_model: str, preferred_name: str, audio_url: str) -> str:
    if not PREFERRED_NAME_PATTERN.fullmatch(preferred_name):
        raise VoiceEnrollmentError(
            "preferred_name 不合法：仅允许数字/字母/下划线，且长度不超过 16。"
        )
    if not audio_url.strip():
        raise VoiceEnrollmentError("audio_url 不能为空。")

    response = post_customization(
        config,
        {
            "action": "create",
            "target_model": target_model,
            "preferred_name": preferred_name,
            "audio": {"data": audio_url},
        },
    )
    output = response.get("output", {})
    if not isinstance(output, dict):
        raise VoiceEnrollmentError("create 响应缺少 output。")
    voice = str(output.get("voice", "")).strip()
    if not voice:
        raise VoiceEnrollmentError("create 成功但未返回 voice。")

    print("[create] success")
    print(f"[create] voice={voice}")
    print(f"[create] target_model={output.get('target_model', '')}")
    print(f"[create] request_id={response.get('request_id', '')}")
    print(f"[create] usage={json.dumps(response.get('usage', {}), ensure_ascii=False)}")
    return voice


def list_voices(config: ClientConfig, *, page_index: int, page_size: int) -> list[dict[str, Any]]:
    response = post_customization(
        config,
        {
            "action": "list",
            "page_index": page_index,
            "page_size": page_size,
        },
    )
    output = response.get("output", {})
    voice_list = output.get("voice_list", []) if isinstance(output, dict) else []
    if not isinstance(voice_list, list):
        raise VoiceEnrollmentError("list 响应中的 voice_list 格式异常。")

    print("[list] success")
    print(f"[list] count={len(voice_list)} request_id={response.get('request_id', '')}")
    for idx, item in enumerate(voice_list, start=1):
        if not isinstance(item, dict):
            continue
        voice = str(item.get("voice", ""))
        created = str(item.get("gmt_create", ""))
        target_model = str(item.get("target_model", ""))
        print(f"[list] {idx:02d}. voice={voice} created={created} target_model={target_model}")
    return [item for item in voice_list if isinstance(item, dict)]


def delete_voice(config: ClientConfig, *, voice: str) -> None:
    chosen = str(voice or "").strip()
    if not chosen:
        raise VoiceEnrollmentError("delete 模式必须提供 --delete-voice。")
    response = post_customization(
        config,
        {
            "action": "delete",
            "voice": chosen,
        },
    )
    print("[delete] success")
    print(f"[delete] voice={chosen}")
    print(f"[delete] request_id={response.get('request_id', '')}")


def _save_pcm_and_wav(audio_bytes: bytes, output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    tag = datetime.now().strftime("%Y%m%d_%H%M%S")
    pcm_path = output_dir / f"qwen_realtime_clone_{tag}.pcm"
    wav_path = output_dir / f"qwen_realtime_clone_{tag}.wav"

    pcm_path.write_bytes(audio_bytes)
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(audio_bytes)
    return pcm_path, wav_path


def synthesize_once_realtime(
    config: ClientConfig,
    *,
    region: str,
    target_model: str,
    voice: str,
    text: str,
    output_dir: Path,
) -> None:
    text = str(text or "").strip()
    if not text:
        raise VoiceEnrollmentError("synthesis_text 不能为空。")

    try:
        import dashscope
        from dashscope.audio.qwen_tts_realtime import (
            AudioFormat,
            QwenTtsRealtime,
            QwenTtsRealtimeCallback,
        )
    except Exception as exc:  # noqa: BLE001
        raise VoiceEnrollmentError(
            "无法导入 qwen_tts_realtime SDK，请确认已安装可用版本 dashscope。"
        ) from exc

    ws_url = WS_CN if region == "cn" else WS_INTL
    dashscope.api_key = config.api_key
    callback = _RealtimeSynthesisCallback()

    class _SdkCallback(QwenTtsRealtimeCallback):
        def on_open(self) -> None:
            callback.on_open()

        def on_close(self, close_status_code: int, close_msg: str) -> None:
            callback.on_close(close_status_code, close_msg)

        def on_event(self, response: dict[str, Any]) -> None:
            callback.on_event(response)

    client = QwenTtsRealtime(model=target_model, callback=_SdkCallback(), url=ws_url)

    print("[tts-realtime] start")
    print(f"[tts-realtime] model={target_model}")
    print(f"[tts-realtime] voice={voice}")
    print(f"[tts-realtime] text={text}")
    print(f"[tts-realtime] ws_url={ws_url}")

    try:
        client.connect()
        client.update_session(
            voice=voice,
            response_format=AudioFormat.PCM_24000HZ_MONO_16BIT,
            mode="server_commit",
        )
        client.append_text(text)
        client.finish()
        if not callback.wait_done(timeout_seconds=max(config.timeout_seconds, 30.0)):
            raise VoiceEnrollmentError("实时合成等待超时，未收到 session.finished。")
        if callback.error_text:
            raise VoiceEnrollmentError(f"实时合成返回错误：{callback.error_text}")
        if not callback.audio_bytes:
            raise VoiceEnrollmentError("实时合成未返回任何音频数据。")
        pcm_path, wav_path = _save_pcm_and_wav(bytes(callback.audio_bytes), output_dir)
        print(f"[tts-realtime] success bytes={len(callback.audio_bytes)}")
        print(f"[tts-realtime] pcm_path={pcm_path}")
        print(f"[tts-realtime] wav_path={wav_path}")
    except Exception as exc:  # noqa: BLE001
        raise VoiceEnrollmentError(f"realtime 合成失败: {exc}") from exc
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            try:
                close()
            except Exception:  # noqa: BLE001
                pass


def main() -> int:
    args = parse_args()
    try:
        config = build_client_config(args)
        print("[info] 该脚本会访问声音复刻接口；create 每次调用可能产生费用（按平台计费规则）。")
        print(f"[info] endpoint={config.endpoint}")
        print(f"[info] mode={args.mode}")

        if args.mode == "create":
            created_voice = create_voice(
                config,
                target_model=args.target_model,
                preferred_name=args.preferred_name,
                audio_url=args.audio_url,
            )
            if not args.skip_synthesis:
                synthesize_once_realtime(
                    config,
                    region=args.region,
                    target_model=args.target_model,
                    voice=created_voice,
                    text=args.synthesis_text,
                    output_dir=args.output_dir,
                )
            return 0

        if args.mode == "list":
            list_voices(config, page_index=args.page_index, page_size=args.page_size)
            return 0

        if args.mode == "delete":
            delete_voice(config, voice=args.delete_voice)
            return 0

        created_voice = create_voice(
            config,
            target_model=args.target_model,
            preferred_name=args.preferred_name,
            audio_url=args.audio_url,
        )
        if not args.skip_synthesis:
            synthesize_once_realtime(
                config,
                region=args.region,
                target_model=args.target_model,
                voice=created_voice,
                text=args.synthesis_text,
                output_dir=args.output_dir,
            )
        voices = list_voices(config, page_index=args.page_index, page_size=args.page_size)
        in_page = any(str(item.get("voice", "")).strip() == created_voice for item in voices)
        print(f"[run] created_voice_in_current_page={in_page}")
        if args.cleanup:
            delete_voice(config, voice=created_voice)
        return 0
    except VoiceEnrollmentError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

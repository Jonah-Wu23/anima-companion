#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Kimi LLM 请求/返回链路诊断脚本。

用途：
1. 复现后端当前发给 LLM 的 payload（system + messages + max_completion_tokens 等）
2. 请求 Kimi 接口并保存原始响应
3. 复用项目内解析逻辑，检查提取/解析结果是否符合预期
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx


def _add_server_to_path(repo_root: Path) -> None:
    server_path = repo_root / "server"
    if str(server_path) not in sys.path:
        sys.path.insert(0, str(server_path))


def _parse_json_obj(text: str, fallback: dict[str, Any]) -> dict[str, Any]:
    raw = str(text or "").strip()
    if not raw:
        return fallback
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON 解析失败: {exc}") from exc
    if not isinstance(parsed, dict):
        raise ValueError("JSON 必须是对象")
    return parsed


def _load_history(history_json: str, user_text: str) -> list[dict[str, str]]:
    raw = str(history_json or "").strip()
    if not raw:
        return [{"role": "user", "content": user_text}]

    path = Path(raw)
    payload: Any
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
    else:
        payload = json.loads(raw)

    if not isinstance(payload, list):
        raise ValueError("history_json 必须是消息数组")

    normalized: list[dict[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "user")).strip()
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        normalized.append({"role": role, "content": content})
    return normalized or [{"role": "user", "content": user_text}]


def _now_tag() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Kimi LLM 端到端请求与解析诊断")
    parser.add_argument("--persona-id", default="phainon")
    parser.add_argument("--user-text", default="你好")
    parser.add_argument("--history-json", default="")
    parser.add_argument(
        "--relationship-json",
        default='{"trust": 0, "reliance": 0, "fatigue": 0}',
    )
    parser.add_argument("--include-initial-injection", action="store_true", default=True)
    parser.add_argument("--no-initial-injection", dest="include_initial_injection", action="store_false")
    parser.add_argument("--base-url", default="")
    parser.add_argument("--model", default="")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--max-completion-tokens", type=int, default=0)
    parser.add_argument("--timeout", type=float, default=0)
    parser.add_argument("--save-dir", default="logs/llm_diag")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    _add_server_to_path(repo_root)

    from app.core.settings import get_settings
    from app.services.dialogue.chat_service import (
        _extract_tts_speak_text,
        _resolve_assistant_text_limit,
        _sanitize_assistant_text,
    )
    from app.services.dialogue.gptsapi_anthropic_client import (
        _build_system_prompt,
        _extract_text,
        _is_kimi_25_model,
        _join_api_path,
        _normalize_messages,
    )
    from app.services.dialogue.llm_output_parser import parse_labeled_response

    settings = get_settings()
    base_url = (args.base_url or settings.llm_api_base_url).strip()
    model = (args.model or settings.llm_model).strip()
    api_key = (args.api_key or settings.llm_api_key).strip()
    timeout = args.timeout if args.timeout > 0 else float(settings.llm_timeout_seconds)
    max_tokens = (
        int(args.max_completion_tokens)
        if args.max_completion_tokens > 0
        else int(settings.llm_max_tokens)
    )

    relationship = _parse_json_obj(
        args.relationship_json,
        {"trust": 0, "reliance": 0, "fatigue": 0},
    )
    history = _load_history(args.history_json, args.user_text)
    normalized_messages = _normalize_messages(history)
    system_prompt = _build_system_prompt(
        args.persona_id,
        relationship,
        include_initial_injection=bool(args.include_initial_injection),
    )

    url = _join_api_path(base_url, "chat/completions")
    payload_messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    payload_messages.extend(normalized_messages)
    payload: dict[str, Any] = {
        "model": model,
        "max_completion_tokens": max_tokens,
        "messages": payload_messages,
    }
    if _is_kimi_25_model(model):
        payload["thinking"] = {"type": "disabled"}

    tag = _now_tag()
    save_dir = (repo_root / args.save_dir).resolve()
    req_path = save_dir / f"{tag}_request.json"
    _write_json(req_path, payload)

    print("=== Kimi 请求诊断 ===")
    print(f"request_url: {url}")
    print(f"model: {model}")
    print(f"timeout: {timeout}")
    print(f"max_completion_tokens: {max_tokens}")
    print(f"messages_count: {len(payload_messages)}")
    print(f"system_prompt_chars: {len(system_prompt)}")
    print(f"request_saved: {req_path}")
    print(
        "system_prompt_preview:\n"
        + system_prompt[:400]
        + ("\n...(truncated)" if len(system_prompt) > 400 else "")
    )

    if args.dry_run:
        print("[dry-run] 已跳过网络请求。")
        return 0

    if not api_key:
        print("[error] 缺少 API Key，请传 --api-key 或设置 LLM_API_KEY", file=sys.stderr)
        return 2

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    response_json: dict[str, Any] | None = None
    response_text = ""
    status_code = -1
    http_error: str | None = None

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload, headers=headers)
            status_code = resp.status_code
            response_text = resp.text
            try:
                data = resp.json()
                if isinstance(data, dict):
                    response_json = data
            except ValueError:
                response_json = None
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        http_error = str(exc)

    raw_path = save_dir / f"{tag}_raw_response.txt"
    raw_path.write_text(response_text, encoding="utf-8")
    print(f"http_status: {status_code}")
    print(f"raw_response_saved: {raw_path}")
    if http_error:
        print(f"[error] HTTP 请求失败: {http_error}")
        if response_json is None:
            return 3

    if response_json is None:
        print("[error] 响应不是 JSON，无法做提取/解析诊断。", file=sys.stderr)
        return 4

    parsed_path = save_dir / f"{tag}_response.json"
    _write_json(parsed_path, response_json)
    print(f"json_response_saved: {parsed_path}")

    extracted_text = _extract_text(response_json)
    parsed = parse_labeled_response(extracted_text)
    assistant_raw_text = str(parsed.get("assistant_text", ""))
    assistant_show_text = _sanitize_assistant_text(
        assistant_raw_text,
        max_chars=_resolve_assistant_text_limit(args.persona_id),
    )
    speak_text = _extract_tts_speak_text(assistant_raw_text)

    report = {
        "http_status": status_code,
        "request_url": url,
        "model": model,
        "has_choices": isinstance(response_json.get("choices"), list),
        "finish_reason": (
            response_json.get("choices", [{}])[0].get("finish_reason")
            if isinstance(response_json.get("choices"), list) and response_json.get("choices")
            else None
        ),
        "usage": response_json.get("usage"),
        "extracted_text": extracted_text,
        "parsed": parsed,
        "assistant_show_text": assistant_show_text,
        "assistant_tts_speak_text": speak_text,
        "checks": {
            "extracted_text_non_empty": bool(extracted_text.strip()),
            "assistant_text_non_empty": bool(assistant_show_text.strip()),
            "speak_tag_extracted": bool(speak_text.strip()),
            "looks_like_only_ellipsis": assistant_show_text.strip() in {"...", "……", ".", "。"},
        },
    }
    report_path = save_dir / f"{tag}_report.json"
    _write_json(report_path, report)

    print("=== 解析结果 ===")
    print(f"report_saved: {report_path}")
    print(f"finish_reason: {report.get('finish_reason')}")
    print(f"assistant_show_text: {assistant_show_text}")
    print(f"assistant_tts_speak_text: {speak_text or '(empty)'}")
    print(f"checks: {json.dumps(report['checks'], ensure_ascii=False)}")

    if report["checks"]["looks_like_only_ellipsis"]:
        print("[warn] assistant_show_text 仍是省略号，建议查看 *_request.json 与 *_response.json 做逐字段排查。")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

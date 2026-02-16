#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""一键启动本地联调全链路（SenseVoice / GPT-SoVITS / Server / Web）。"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

FORCED_SERVER_PORT = 18000
FORCED_WEB_API_BASE_URL = f"http://127.0.0.1:{FORCED_SERVER_PORT}"


def parse_args() -> argparse.Namespace:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    parser = argparse.ArgumentParser(
        description="启动本地全链路：SenseVoice -> GPT-SoVITS -> 切权重 -> Server -> Web"
    )
    parser.add_argument(
        "--frontend-backend-only",
        action="store_true",
        help="仅启动前后端（Server + Web），跳过 SenseVoice / GPT-SoVITS / 切权重。",
    )
    parser.add_argument("--repo-root", type=Path, default=repo_root)
    parser.add_argument("--sensevoice-root", type=Path, default=Path(r"E:\AI\VTT\SenseVoice"))
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--web-port", type=int, default=3001)
    parser.add_argument(
        "--server-port",
        type=int,
        default=FORCED_SERVER_PORT,
        help=f"已固定为 {FORCED_SERVER_PORT}，传入其他值会被忽略。",
    )
    parser.add_argument("--sensevoice-port", type=int, default=50000)
    parser.add_argument("--gpt-sovits-port", type=int, default=9880)
    parser.add_argument(
        "--web-api-base-url",
        default="",
        help=f"已固定为 {FORCED_WEB_API_BASE_URL}，传入其他值会被忽略。",
    )
    parser.add_argument(
        "--server-reload",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="是否以 --reload 模式启动 server（默认开启）。",
    )
    parser.add_argument(
        "--restart-server",
        action="store_true",
        help="若 server 端口已占用，先强制结束占用进程再启动。",
    )
    parser.add_argument("--skip-weights", action="store_true")
    parser.add_argument("--wait-timeout", type=int, default=180)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def get_pwsh_executable() -> str:
    pwsh = shutil.which("pwsh")
    if pwsh:
        return pwsh
    raise RuntimeError("未找到 pwsh，请先安装 PowerShell 7 并加入 PATH。")


def is_port_open(host: str, port: int, timeout: float = 0.6) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        return sock.connect_ex((host, port)) == 0


def wait_port(host: str, port: int, timeout_seconds: int) -> bool:
    start = time.time()
    while time.time() - start <= timeout_seconds:
        if is_port_open(host, port):
            return True
        time.sleep(1.0)
    return False


def wait_http_ok(url: str, timeout_seconds: int) -> bool:
    start = time.time()
    while time.time() - start <= timeout_seconds:
        try:
            with urllib.request.urlopen(url, timeout=2.5) as response:
                if response.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(1.0)
    return False


def _extract_port(endpoint: str) -> int | None:
    text = str(endpoint or "").strip()
    if not text:
        return None
    try:
        return int(text.rsplit(":", 1)[1])
    except (IndexError, ValueError):
        return None


def get_listening_pids_on_port(port: int) -> list[int]:
    try:
        output = subprocess.check_output(
            ["netstat", "-ano", "-p", "tcp"],
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except (OSError, subprocess.SubprocessError):
        return []

    pids: set[int] = set()
    for line in output.splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        state = parts[3].upper()
        if state != "LISTENING":
            continue
        parsed_port = _extract_port(parts[1])
        if parsed_port != port:
            continue
        try:
            pids.add(int(parts[4]))
        except ValueError:
            continue
    return sorted(pids)


def kill_process_tree(pid: int, dry_run: bool) -> None:
    print(f"[kill] taskkill /PID {pid} /F /T")
    if dry_run:
        return
    subprocess.run(
        ["taskkill", "/PID", str(pid), "/F", "/T"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def launch_in_new_console(pwsh: str, command: str, dry_run: bool) -> None:
    display = f'{pwsh} -NoLogo -NoExit -Command "{command}"'
    print(f"[launch] {display}")
    if dry_run:
        return
    creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
    subprocess.Popen(
        [pwsh, "-NoLogo", "-NoExit", "-Command", command],
        creationflags=creationflags,
    )


def run_blocking(pwsh: str, script: Path, args: list[str], dry_run: bool) -> None:
    command = [pwsh, "-NoLogo", "-NoProfile", "-File", str(script), *args]
    print(f"[run] {' '.join(command)}")
    if dry_run:
        return
    subprocess.run(command, check=True)


def main() -> int:
    args = parse_args()
    start_voice_stack = not args.frontend_backend_only
    server_port = FORCED_SERVER_PORT
    if args.server_port != FORCED_SERVER_PORT:
        print(
            f"[warn] --server-port={args.server_port} 已被忽略，统一使用 {FORCED_SERVER_PORT}。"
        )
    forced_web_api_base_url = FORCED_WEB_API_BASE_URL
    input_web_api_base_url = str(args.web_api_base_url or "").strip()
    if input_web_api_base_url and input_web_api_base_url != forced_web_api_base_url:
        print(
            f"[warn] --web-api-base-url={input_web_api_base_url} 已被忽略，统一使用 {forced_web_api_base_url}。"
        )
    repo_root = args.repo_root.resolve()
    if not repo_root.exists():
        print(f"[error] repo_root 不存在: {repo_root}", file=sys.stderr)
        return 1

    pwsh = get_pwsh_executable()
    start_sensevoice = repo_root / "scripts" / "dev" / "start_sensevoice_api.ps1"
    start_gpt_sovits = repo_root / "scripts" / "dev" / "start_gpt_sovits_api.ps1"
    set_weights = repo_root / "scripts" / "dev" / "set_gpt_sovits_weights.ps1"
    start_server = repo_root / "scripts" / "dev" / "start_server.ps1"
    start_web = repo_root / "scripts" / "dev" / "start_web.ps1"

    required = [start_server, start_web]
    if start_voice_stack:
        required.extend([start_sensevoice, start_gpt_sovits])
    if start_voice_stack and not args.skip_weights:
        required.append(set_weights)
    for path in required:
        if not path.exists():
            print(f"[error] 缺少脚本: {path}", file=sys.stderr)
            return 1

    repo_ps = ps_quote(str(repo_root))
    sensevoice_root_ps = ps_quote(str(args.sensevoice_root))

    if not start_voice_stack:
        print("[info] 已启用仅前后端模式：跳过 SenseVoice / GPT-SoVITS / 切权重。")
    else:
        if is_port_open("127.0.0.1", args.sensevoice_port):
            print(f"[info] SenseVoice 端口 {args.sensevoice_port} 已在监听，跳过启动。")
        else:
            command = (
                f"Set-Location {repo_ps}; "
                f"& {ps_quote(str(start_sensevoice))} -Root {sensevoice_root_ps} -Device {ps_quote(args.device)}"
            )
            launch_in_new_console(pwsh, command, args.dry_run)
            if not args.dry_run:
                print(f"[wait] 等待 SenseVoice 端口 {args.sensevoice_port} 就绪...")
                if not wait_port("127.0.0.1", args.sensevoice_port, args.wait_timeout):
                    print("[error] SenseVoice 未在超时时间内就绪。", file=sys.stderr)
                    return 1

        if is_port_open("127.0.0.1", args.gpt_sovits_port):
            print(f"[info] GPT-SoVITS 端口 {args.gpt_sovits_port} 已在监听，跳过启动。")
        else:
            command = f"Set-Location {repo_ps}; & {ps_quote(str(start_gpt_sovits))}"
            launch_in_new_console(pwsh, command, args.dry_run)
            if not args.dry_run:
                print(f"[wait] 等待 GPT-SoVITS 端口 {args.gpt_sovits_port} 就绪...")
                if not wait_port("127.0.0.1", args.gpt_sovits_port, args.wait_timeout):
                    print("[error] GPT-SoVITS 未在超时时间内就绪。", file=sys.stderr)
                    return 1

        if not args.dry_run:
            print("[wait] 等待 GPT-SoVITS /speakers_list 可用...")
            speakers_url = f"http://127.0.0.1:{args.gpt_sovits_port}/speakers_list"
            if not wait_http_ok(speakers_url, args.wait_timeout):
                print("[error] GPT-SoVITS /speakers_list 检查失败。", file=sys.stderr)
                return 1

        if args.skip_weights:
            print("[info] 已跳过权重切换（--skip-weights）。")
        else:
            run_blocking(pwsh, set_weights, [], args.dry_run)

    server_is_listening = is_port_open("127.0.0.1", server_port) or is_port_open(
        "0.0.0.0",
        server_port,
    )
    if server_is_listening and args.restart_server:
        listening_pids = get_listening_pids_on_port(server_port)
        if listening_pids:
            print(f"[info] Server 端口 {server_port} 已被占用，准备重启: PIDs={listening_pids}")
            for pid in listening_pids:
                kill_process_tree(pid, args.dry_run)
            if not args.dry_run:
                time.sleep(1.0)
        server_is_listening = is_port_open("127.0.0.1", server_port) or is_port_open(
            "0.0.0.0",
            server_port,
        )
        if server_is_listening:
            print(f"[error] Server 端口 {server_port} 仍被占用，无法重启。", file=sys.stderr)
            return 1

    if server_is_listening:
        print(f"[info] Server 端口 {server_port} 已在监听，跳过启动。")
    else:
        reload_literal = "$true" if args.server_reload else "$false"
        command = (
            f"Set-Location {repo_ps}; "
            f"& {ps_quote(str(start_server))} -Port {server_port} -Reload:{reload_literal}"
        )
        launch_in_new_console(pwsh, command, args.dry_run)

    if is_port_open("127.0.0.1", args.web_port):
        print(
            f"[info] Web 端口 {args.web_port} 已在监听，跳过启动。"
            f" 如需切换 API 到 {forced_web_api_base_url}，请先重启 Web。"
        )
    else:
        command = (
            f"Set-Location {repo_ps}; "
            f"& {ps_quote(str(start_web))} -Port {args.web_port} -ApiBaseUrl {ps_quote(forced_web_api_base_url)}"
        )
        launch_in_new_console(pwsh, command, args.dry_run)

    print("[done] 启动流程已执行。")
    hint = (
        f"[hint] 预期地址：Web=http://localhost:{args.web_port} "
        f"Server=http://127.0.0.1:{server_port}"
    )
    if start_voice_stack:
        hint += (
            f" SenseVoice=http://127.0.0.1:{args.sensevoice_port} "
            f"GPT-SoVITS=http://127.0.0.1:{args.gpt_sovits_port}"
        )
    else:
        hint += "（仅前后端模式，未启动 SenseVoice / GPT-SoVITS）"
    print(hint)
    return 0


if __name__ == "__main__":
    sys.exit(main())

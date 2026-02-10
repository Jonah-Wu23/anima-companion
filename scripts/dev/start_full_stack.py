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


def parse_args() -> argparse.Namespace:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    parser = argparse.ArgumentParser(
        description="启动本地全链路：SenseVoice -> GPT-SoVITS -> 切权重 -> Server -> Web"
    )
    parser.add_argument("--repo-root", type=Path, default=repo_root)
    parser.add_argument("--sensevoice-root", type=Path, default=Path(r"E:\AI\VTT\SenseVoice"))
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--web-port", type=int, default=3001)
    parser.add_argument("--server-port", type=int, default=8000)
    parser.add_argument("--sensevoice-port", type=int, default=50000)
    parser.add_argument("--gpt-sovits-port", type=int, default=9880)
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

    required = [start_sensevoice, start_gpt_sovits, start_server, start_web]
    if not args.skip_weights:
        required.append(set_weights)
    for path in required:
        if not path.exists():
            print(f"[error] 缺少脚本: {path}", file=sys.stderr)
            return 1

    repo_ps = ps_quote(str(repo_root))
    sensevoice_root_ps = ps_quote(str(args.sensevoice_root))

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

    if is_port_open("127.0.0.1", args.server_port):
        print(f"[info] Server 端口 {args.server_port} 已在监听，跳过启动。")
    else:
        command = f"Set-Location {repo_ps}; & {ps_quote(str(start_server))}"
        launch_in_new_console(pwsh, command, args.dry_run)

    if is_port_open("127.0.0.1", args.web_port):
        print(f"[info] Web 端口 {args.web_port} 已在监听，跳过启动。")
    else:
        command = f"Set-Location {repo_ps}; & {ps_quote(str(start_web))} -Port {args.web_port}"
        launch_in_new_console(pwsh, command, args.dry_run)

    print("[done] 启动流程已执行。")
    print(
        f"[hint] 预期地址：Web=http://localhost:{args.web_port} "
        f"Server=http://127.0.0.1:{args.server_port} "
        f"SenseVoice=http://127.0.0.1:{args.sensevoice_port} "
        f"GPT-SoVITS=http://127.0.0.1:{args.gpt_sovits_port}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

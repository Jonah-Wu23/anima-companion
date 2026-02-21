#!/usr/bin/env python3
"""校验 /api/local-files 资源可用性（模型 PMX + 动作清单 VMD）。"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="验证模型与动作资源是否可通过 /api/local-files 访问",
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:3000",
        help="检查目标站点（默认: http://127.0.0.1:3000）",
    )
    return parser.parse_args()


def load_model_paths(repo_root: Path) -> list[str]:
    registry_path = repo_root / "web/src/lib/wardrobe/model-registry.ts"
    text = registry_path.read_text(encoding="utf-8")
    pattern = re.compile(r"directory:\s*'([^']+)'.*?pmxFile:\s*'([^']+)'", re.S)
    paths: list[str] = []
    for directory, pmx_file in pattern.findall(text):
        normalized = f"{directory.rstrip('/')}/{pmx_file.lstrip('/')}"
        paths.append(normalized)
    return paths


def load_motion_paths(repo_root: Path) -> list[str]:
    motion_dir = repo_root / "configs/motions"
    paths: list[str] = []
    for file in sorted(motion_dir.glob("*-motion-manifest.json")):
        data = json.loads(file.read_text(encoding="utf-8"))
        for state in (data.get("states") or {}).values():
            for candidate in (state.get("candidates") or []):
                motion_path = candidate.get("path")
                if isinstance(motion_path, str) and motion_path.strip():
                    paths.append(motion_path.strip())
    return paths


def to_local_files_path(raw_path: str) -> str:
    normalized = raw_path.replace("\\", "/").lstrip("/")
    if normalized.startswith("assets/") or normalized.startswith("configs/"):
        return f"/api/local-files/{normalized}"
    return f"/api/local-files/assets/{normalized}"


def fetch_status(url: str) -> tuple[int | None, str]:
    request = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return response.status, ""
    except urllib.error.HTTPError as exc:
        return exc.code, str(exc.reason)
    except Exception as exc:  # pragma: no cover - 运维脚本保底
        return None, str(exc)


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    base_url = args.base_url.rstrip("/")

    model_paths = load_model_paths(repo_root)
    motion_paths = load_motion_paths(repo_root)
    all_paths = sorted(set(model_paths + motion_paths))

    failures: list[tuple[int | None, str, str]] = []
    for raw_path in all_paths:
        local_files_path = to_local_files_path(raw_path)
        encoded_path = urllib.parse.quote(local_files_path, safe="/:?&=%")
        url = f"{base_url}{encoded_path}"
        status, message = fetch_status(url)
        if status != 200:
            failures.append((status, raw_path, message))
            print(f"[FAIL] {status} {raw_path} {message}".rstrip())
        else:
            print(f"[ OK ] 200 {raw_path}")

    print()
    print(f"Checked: {len(all_paths)}")
    print(f"Failed : {len(failures)}")
    if failures:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())


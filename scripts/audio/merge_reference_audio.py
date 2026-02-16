"""使用 ffmpeg 拼接参考音频。"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Merge reference audios."
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=None,
        help="输入目录（默认读取其中全部 .wav 文件，按文件名排序）",
    )
    parser.add_argument(
        "--inputs",
        nargs="*",
        type=Path,
        default=None,
        help="显式输入文件列表（优先级高于 --input-dir）",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="输出音频路径",
    )
    parser.add_argument(
        "--target-duration",
        type=float,
        default=None,
        help="目标时长（秒）。不传则按原始拼接总时长输出",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=16000,
        help="输出采样率，默认 16000",
    )
    parser.add_argument(
        "--channels",
        type=int,
        default=1,
        help="输出声道数，默认单声道",
    )
    parser.add_argument(
        "--codec",
        type=str,
        default="pcm_s16le",
        help="输出编码，默认 pcm_s16le（wav）",
    )
    return parser.parse_args()


def resolve_inputs(args: argparse.Namespace) -> list[Path]:
    if args.inputs:
        return [path.resolve() for path in args.inputs]
    if args.input_dir:
        directory = args.input_dir.resolve()
        return sorted(directory.glob("*.wav"))
    return []


def ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("未检测到 ffmpeg，请先安装并加入 PATH")


def ensure_ffprobe() -> bool:
    return shutil.which("ffprobe") is not None


def main() -> int:
    args = parse_args()
    ensure_ffmpeg()

    inputs = resolve_inputs(args)
    if len(inputs) < 2:
        print("至少需要 2 个输入文件。", file=sys.stderr)
        return 2

    missing = [str(path) for path in inputs if not path.is_file()]
    if missing:
        print("以下输入文件不存在：", file=sys.stderr)
        for item in missing:
            print(f"- {item}", file=sys.stderr)
        return 2

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    concat_streams = "".join(f"[{idx}:a]" for idx in range(len(inputs)))
    if args.target_duration is None:
        filter_complex = f"{concat_streams}concat=n={len(inputs)}:v=0:a=1[out]"
    else:
        target = max(1.0, float(args.target_duration))
        filter_complex = (
            f"{concat_streams}concat=n={len(inputs)}:v=0:a=1[cat];"
            f"[cat]apad=pad_dur={target:.3f},atrim=0:{target:.3f}[out]"
        )

    cmd: list[str] = ["ffmpeg", "-y"]
    for path in inputs:
        cmd.extend(["-i", str(path)])
    cmd.extend(
        [
            "-filter_complex",
            filter_complex,
            "-map",
            "[out]",
            "-ar",
            str(args.sample_rate),
            "-ac",
            str(args.channels),
            "-c:a",
            args.codec,
            str(output),
        ]
    )

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    if result.returncode != 0:
        print("ffmpeg 执行失败：", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        return result.returncode

    print(f"输出文件: {output}")
    if ensure_ffprobe():
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nw=1:nk=1",
                str(output),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
        if probe.returncode == 0 and probe.stdout.strip():
            print(f"输出时长: {probe.stdout.strip()} 秒")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

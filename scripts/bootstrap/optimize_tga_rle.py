#!/usr/bin/env python3
"""将大型 TGA 贴图重编码为 TGA-RLE，降低体积且保持同扩展名兼容。"""

from __future__ import annotations

import argparse
import io
import shutil
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Optimize .tga textures with TGA-RLE encoding.')
    parser.add_argument(
        '--root',
        default='assets/models',
        help='scan root directory (default: assets/models)',
    )
    parser.add_argument(
        '--min-size-kb',
        type=int,
        default=128,
        help='minimum file size to process in KB (default: 128)',
    )
    parser.add_argument(
        '--apply',
        action='store_true',
        help='write changes to source files (default: dry-run)',
    )
    parser.add_argument(
        '--backup-suffix',
        default='.bak',
        help='backup suffix when --apply is set (default: .bak)',
    )
    return parser.parse_args()


def iter_tga_files(root: Path, min_size_bytes: int) -> list[Path]:
    if not root.exists():
        return []
    return [p for p in root.rglob('*.tga') if p.is_file() and p.stat().st_size >= min_size_bytes]


def format_mb(size_bytes: int) -> str:
    return f'{size_bytes / (1024 * 1024):.2f}MB'


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    min_size_bytes = max(0, args.min_size_kb) * 1024
    targets = iter_tga_files(root, min_size_bytes)

    scanned = len(targets)
    improved = 0
    skipped = 0
    failed = 0
    saved_total = 0

    for src_path in targets:
        src_size = src_path.stat().st_size

        try:
            with Image.open(src_path) as image:
                output = io.BytesIO()
                image.save(output, format='TGA', compression='tga_rle')
                dst_bytes = output.getvalue()
            dst_size = len(dst_bytes)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f'[FAIL] {src_path}: {exc}')
            continue

        if dst_size >= src_size:
            skipped += 1
            continue

        improved += 1
        saved = src_size - dst_size
        saved_total += saved
        print(
            f'[OK] {src_path}: {format_mb(src_size)} -> {format_mb(dst_size)} '
            f'(saved {format_mb(saved)})'
        )

        if args.apply:
            try:
                backup_path = src_path.with_name(f'{src_path.name}{args.backup_suffix}')
                if not backup_path.exists():
                    shutil.copy2(src_path, backup_path)
                src_path.write_bytes(dst_bytes)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f'[FAIL] write {src_path}: {exc}')

    mode = 'apply' if args.apply else 'dry-run'
    print(f'[SUMMARY] mode={mode} scanned={scanned} improved={improved} skipped={skipped} failed={failed}')
    print(f'[SUMMARY] total_saved={format_mb(saved_total)}')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())

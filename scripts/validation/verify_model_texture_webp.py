#!/usr/bin/env python3
"""校验模型贴图 WebP 覆盖率与可读性。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

SOURCE_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.bmp', '.tga', '.gif', '.sph', '.spa')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Verify .webp textures generated for assets/models sources.'
    )
    parser.add_argument(
        '--root',
        default='assets/models',
        help='scan root directory (default: assets/models)',
    )
    parser.add_argument(
        '--report-path',
        default='',
        help='optional JSON report output path',
    )
    return parser.parse_args()


def iter_source_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    files: list[Path] = []
    for path in root.rglob('*'):
        if path.is_file() and path.suffix.lower() in SOURCE_EXTENSIONS:
            files.append(path)
    files.sort()
    return files


def relative_path(base: Path, target: Path) -> str:
    try:
        return str(target.relative_to(base))
    except ValueError:
        return str(target)


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    sources = iter_source_files(root)

    summary = {
        'root': str(root),
        'checked': len(sources),
        'missing_webp': 0,
        'decode_failed': 0,
        'size_mismatch': 0,
    }
    failures: list[dict[str, str]] = []

    for source in sources:
        webp_path = source.with_suffix('.webp')
        display_path = relative_path(root, source)

        if not webp_path.exists():
            summary['missing_webp'] += 1
            failures.append({'type': 'missing_webp', 'source': display_path})
            print(f'[FAIL] missing webp: {display_path}')
            continue

        try:
            with Image.open(source) as source_image:
                source_image.load()
                source_size = source_image.size
        except Exception as exc:  # noqa: BLE001
            summary['decode_failed'] += 1
            failures.append({'type': 'decode_source_failed', 'source': display_path, 'error': str(exc)})
            print(f'[FAIL] decode source failed: {display_path} ({exc})')
            continue

        try:
            with Image.open(webp_path) as webp_image:
                webp_image.load()
                webp_size = webp_image.size
        except Exception as exc:  # noqa: BLE001
            summary['decode_failed'] += 1
            failures.append({'type': 'decode_webp_failed', 'source': display_path, 'error': str(exc)})
            print(f'[FAIL] decode webp failed: {display_path} ({exc})')
            continue

        if source_size != webp_size:
            summary['size_mismatch'] += 1
            failures.append(
                {
                    'type': 'size_mismatch',
                    'source': display_path,
                    'source_size': f'{source_size[0]}x{source_size[1]}',
                    'webp_size': f'{webp_size[0]}x{webp_size[1]}',
                }
            )
            print(
                f'[FAIL] size mismatch: {display_path} '
                f'(src={source_size[0]}x{source_size[1]}, webp={webp_size[0]}x{webp_size[1]})'
            )
            continue

        print(f'[ OK ] {display_path}')

    total_failures = summary['missing_webp'] + summary['decode_failed'] + summary['size_mismatch']
    print()
    print(
        f"[verify-webp] checked={summary['checked']} missing={summary['missing_webp']} "
        f"decode_failed={summary['decode_failed']} size_mismatch={summary['size_mismatch']}"
    )

    report = {
        'summary': summary,
        'failures': failures,
    }
    if args.report_path:
        report_path = Path(args.report_path).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'[verify-webp] report={report_path}')

    return 0 if total_failures == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())

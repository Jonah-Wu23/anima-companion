#!/usr/bin/env python3
"""批量将 assets/models 下贴图转换为 WebP（保留原图，支持 dry-run）。"""

from __future__ import annotations

import argparse
import io
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

DEFAULT_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.bmp', '.tga', '.gif', '.sph', '.spa')


@dataclass
class ConvertedItem:
    source: str
    webp: str
    source_bytes: int
    webp_bytes: int
    lossless: bool
    status: str
    model: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Convert model textures to WebP with alpha-aware strategy.'
    )
    parser.add_argument(
        '--root',
        default='assets/models',
        help='scan root directory (default: assets/models)',
    )
    parser.add_argument(
        '--quality',
        type=int,
        default=84,
        help='quality for non-alpha textures (default: 84)',
    )
    parser.add_argument(
        '--method',
        type=int,
        default=6,
        help='WebP encoder method 0-6 (default: 6)',
    )
    parser.add_argument(
        '--min-size-kb',
        type=int,
        default=0,
        help='skip files smaller than this size in KB (default: 0)',
    )
    parser.add_argument(
        '--apply',
        action='store_true',
        help='write .webp files (default: dry-run)',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='force dry-run mode (for explicit CI/release commands)',
    )
    parser.add_argument(
        '--report-path',
        default='',
        help='optional JSON report path',
    )
    return parser.parse_args()


def has_alpha_channel(image: Image.Image) -> bool:
    if 'A' in image.getbands():
        return True
    return image.info.get('transparency') is not None


def normalize_model_name(root: Path, source_path: Path) -> str:
    try:
        relative = source_path.relative_to(root)
    except ValueError:
        return source_path.parent.name
    return relative.parts[0] if relative.parts else source_path.parent.name


def iter_source_textures(root: Path, min_size_bytes: int) -> list[Path]:
    if not root.exists():
        return []
    files: list[Path] = []
    for path in root.rglob('*'):
        if not path.is_file():
            continue
        if path.suffix.lower() not in DEFAULT_EXTENSIONS:
            continue
        if path.stat().st_size < min_size_bytes:
            continue
        files.append(path)
    files.sort()
    return files


def encode_webp_bytes(image: Image.Image, quality: int, method: int, lossless: bool) -> bytes:
    output = io.BytesIO()
    save_options: dict[str, object] = {
        'format': 'WEBP',
        'method': max(0, min(6, method)),
    }
    if lossless:
        save_options['lossless'] = True
    else:
        save_options['quality'] = max(1, min(100, quality))
    image.save(output, **save_options)
    return output.getvalue()


def format_mb(size_bytes: int) -> str:
    return f'{size_bytes / (1024 * 1024):.2f}MB'


def main() -> int:
    args = parse_args()
    if args.apply and args.dry_run:
        raise SystemExit('cannot use --apply and --dry-run at the same time')

    apply_mode = args.apply and not args.dry_run
    root = Path(args.root).resolve()
    min_size_bytes = max(0, args.min_size_kb) * 1024
    targets = iter_source_textures(root, min_size_bytes)

    summary = {
        'mode': 'apply' if apply_mode else 'dry-run',
        'root': str(root),
        'scanned': len(targets),
        'converted': 0,
        'up_to_date': 0,
        'failed': 0,
        'larger_than_source': 0,
        'source_bytes': 0,
        'webp_bytes': 0,
    }
    by_model: dict[str, dict[str, int]] = {}
    failures: list[dict[str, str]] = []
    items: list[ConvertedItem] = []

    for source_path in targets:
        webp_path = source_path.with_suffix('.webp')
        source_stat = source_path.stat()
        source_bytes = source_stat.st_size
        model_name = normalize_model_name(root, source_path)

        model_stats = by_model.setdefault(
            model_name,
            {
                'files': 0,
                'source_bytes': 0,
                'webp_bytes': 0,
                'larger_than_source': 0,
            },
        )
        model_stats['files'] += 1
        model_stats['source_bytes'] += source_bytes

        if webp_path.exists() and webp_path.stat().st_mtime >= source_stat.st_mtime:
            summary['up_to_date'] += 1
            model_stats['webp_bytes'] += webp_path.stat().st_size
            continue

        try:
            with Image.open(source_path) as image:
                image.load()
                lossless = has_alpha_channel(image)
                webp_bytes = encode_webp_bytes(image, args.quality, args.method, lossless)
        except Exception as exc:  # noqa: BLE001
            summary['failed'] += 1
            failures.append(
                {
                    'source': str(source_path),
                    'error': str(exc),
                }
            )
            continue

        if len(webp_bytes) > source_bytes:
            summary['larger_than_source'] += 1
            model_stats['larger_than_source'] += 1

        summary['converted'] += 1
        summary['source_bytes'] += source_bytes
        summary['webp_bytes'] += len(webp_bytes)
        model_stats['webp_bytes'] += len(webp_bytes)

        if apply_mode:
            webp_path.write_bytes(webp_bytes)

        items.append(
            ConvertedItem(
                source=str(source_path),
                webp=str(webp_path),
                source_bytes=source_bytes,
                webp_bytes=len(webp_bytes),
                lossless=lossless,
                status='written' if apply_mode else 'would_write',
                model=model_name,
            )
        )

    saved_bytes = max(0, summary['source_bytes'] - summary['webp_bytes'])
    saved_ratio = (
        round(saved_bytes / summary['source_bytes'] * 100, 2) if summary['source_bytes'] > 0 else 0.0
    )
    summary['saved_bytes'] = saved_bytes
    summary['saved_ratio_pct'] = saved_ratio

    print(
        f"[webp-convert] mode={summary['mode']} scanned={summary['scanned']} "
        f"converted={summary['converted']} up_to_date={summary['up_to_date']} failed={summary['failed']}"
    )
    print(
        f"[webp-convert] source={format_mb(summary['source_bytes'])} "
        f"webp={format_mb(summary['webp_bytes'])} saved={format_mb(saved_bytes)} ({saved_ratio:.2f}%)"
    )
    if summary['larger_than_source'] > 0:
        print(f"[webp-convert] larger_than_source={summary['larger_than_source']}")

    report = {
        'summary': summary,
        'by_model': by_model,
        'failures': failures,
        'items': [item.__dict__ for item in items],
        'options': {
            'quality': args.quality,
            'method': args.method,
            'min_size_kb': args.min_size_kb,
            'lossless_for_alpha': True,
        },
    }

    if args.report_path:
        report_path = Path(args.report_path).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'[webp-convert] report={report_path}')

    return 0 if summary['failed'] == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())

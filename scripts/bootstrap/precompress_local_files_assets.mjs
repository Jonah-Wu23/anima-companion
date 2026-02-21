#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_ROOTS = ['assets', 'configs'];
const COMPRESSIBLE_EXTENSIONS = new Set([
  '.pmx',
  '.vmd',
  '.tga',
  '.bmp',
  '.json',
  '.yaml',
  '.yml',
  '.txt',
  '.js',
  '.mjs',
  '.wasm',
]);

function parseArgs(argv) {
  const args = {
    dryRun: false,
    minSizeBytes: 1024,
    roots: DEFAULT_ROOTS,
  };

  for (const raw of argv) {
    if (raw === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (raw.startsWith('--min-size=')) {
      const value = Number(raw.slice('--min-size='.length));
      if (Number.isFinite(value) && value >= 0) {
        args.minSizeBytes = Math.floor(value);
      }
      continue;
    }
    if (raw.startsWith('--roots=')) {
      const value = raw.slice('--roots='.length).trim();
      if (value) {
        args.roots = value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }
  }

  return args;
}

async function walkFiles(rootPath) {
  const files = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function shouldHandle(filePath) {
  if (filePath.endsWith('.br') || filePath.endsWith('.gz')) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  return COMPRESSIBLE_EXTENSIONS.has(ext);
}

function compressWithBrotli(buffer) {
  return brotliCompressSync(buffer, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
    },
  });
}

function compressWithGzip(buffer) {
  return gzipSync(buffer, { level: 5 });
}

async function shouldRegenerateSidecar(sourcePath, sourceStat, sidecarPath) {
  try {
    const sidecarStat = await stat(sidecarPath);
    if (!sidecarStat.isFile()) {
      return true;
    }
    return sidecarStat.mtimeMs < sourceStat.mtimeMs;
  } catch {
    return true;
  }
}

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const roots = args.roots
    .map((root) => path.resolve(REPO_ROOT, root))
    .filter((rootPath) => rootPath.startsWith(`${REPO_ROOT}${path.sep}`));

  const statsSummary = {
    scanned: 0,
    eligible: 0,
    written: 0,
    upToDate: 0,
    notSmaller: 0,
    failedWrites: 0,
    sourceBytes: 0,
    compressedBytes: 0,
  };

  for (const rootPath of roots) {
    const files = await walkFiles(rootPath);
    for (const filePath of files) {
      statsSummary.scanned += 1;
      if (!shouldHandle(filePath)) {
        continue;
      }

      const sourceStat = await stat(filePath);
      if (sourceStat.size < args.minSizeBytes) {
        continue;
      }

      statsSummary.eligible += 1;
      const sourceBuffer = await readFile(filePath);
      const variants = [
        { suffix: '.br', compressor: compressWithBrotli },
        { suffix: '.gz', compressor: compressWithGzip },
      ];

      for (const variant of variants) {
        const sidecarPath = `${filePath}${variant.suffix}`;
        const needsRegenerate = await shouldRegenerateSidecar(filePath, sourceStat, sidecarPath);
        if (!needsRegenerate) {
          statsSummary.upToDate += 1;
          continue;
        }

        const compressedBuffer = variant.compressor(sourceBuffer);
        if (compressedBuffer.byteLength >= sourceBuffer.byteLength) {
          statsSummary.notSmaller += 1;
          continue;
        }

        statsSummary.sourceBytes += sourceBuffer.byteLength;
        statsSummary.compressedBytes += compressedBuffer.byteLength;
        if (!args.dryRun) {
          try {
            await writeFile(sidecarPath, compressedBuffer);
          } catch (error) {
            statsSummary.failedWrites += 1;
            console.warn(`[precompress] skip write: ${sidecarPath} (${error?.code ?? 'unknown'})`);
            continue;
          }
        }
        statsSummary.written += 1;
      }
    }
  }

  const savedBytes = Math.max(0, statsSummary.sourceBytes - statsSummary.compressedBytes);
  const savedRatio =
    statsSummary.sourceBytes > 0
      ? ((savedBytes / statsSummary.sourceBytes) * 100).toFixed(1)
      : '0.0';

  console.log(`[precompress] roots=${roots.map((root) => path.relative(REPO_ROOT, root)).join(',')}`);
  console.log(`[precompress] scanned=${statsSummary.scanned} eligible=${statsSummary.eligible}`);
  console.log(
    `[precompress] written=${statsSummary.written} up_to_date=${statsSummary.upToDate} not_smaller=${statsSummary.notSmaller} failed_writes=${statsSummary.failedWrites}`
  );
  console.log(
    `[precompress] source=${formatMB(statsSummary.sourceBytes)}MB compressed=${formatMB(statsSummary.compressedBytes)}MB saved=${formatMB(savedBytes)}MB (${savedRatio}%)`
  );
  if (args.dryRun) {
    console.log('[precompress] dry-run=true (未写入文件)');
  }
}

main().catch((error) => {
  console.error('[precompress] failed', error);
  process.exitCode = 1;
});

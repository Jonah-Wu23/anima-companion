import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const ALLOWED_ROOTS = new Set(['assets', 'configs']);

const CONTENT_TYPES: Record<string, string> = {
  '.pmx': 'application/octet-stream',
  '.vmd': 'application/octet-stream',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tga': 'image/x-targa',
  '.txt': 'text/plain; charset=utf-8',
};

const COMPAT_TEXTURE_FALLBACKS: Record<string, string[]> = {
  '1.png': ['toon3.png', 'toon4.png', 'toon5.png'],
};

function resolveSafePath(segments: string[]): string | null {
  if (!segments.length) {
    return null;
  }

  const decoded = segments.map((part) => decodeURIComponent(part));
  if (!ALLOWED_ROOTS.has(decoded[0])) {
    return null;
  }

  const absolutePath = path.resolve(REPO_ROOT, ...decoded);
  const normalizedRoot = `${REPO_ROOT}${path.sep}`;
  if (!absolutePath.startsWith(normalizedRoot)) {
    return null;
  }
  return absolutePath;
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

async function resolveCompatFallback(filePath: string): Promise<string | null> {
  const fileName = path.basename(filePath).toLowerCase();
  const candidates = COMPAT_TEXTURE_FALLBACKS[fileName];
  if (!candidates?.length) {
    return null;
  }

  const parentDir = path.dirname(filePath);
  for (const candidate of candidates) {
    const candidatePath = path.resolve(parentDir, candidate);
    if (!candidatePath.startsWith(`${REPO_ROOT}${path.sep}`)) {
      continue;
    }

    try {
      const candidateStat = await stat(candidatePath);
      if (candidateStat.isFile()) {
        return candidatePath;
      }
    } catch {
      // 尝试下一个候选回退贴图
    }
  }

  return null;
}

async function readLocalFileResponse(filePath: string): Promise<Response> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    return new Response('Not found', { status: 404 });
  }

  const buffer = await readFile(filePath);
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': getContentType(filePath),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await context.params;
  const absolutePath = resolveSafePath(pathSegments);
  if (!absolutePath) {
    return new Response('Not found', { status: 404 });
  }

  try {
    return await readLocalFileResponse(absolutePath);
  } catch {
    const fallbackPath = await resolveCompatFallback(absolutePath);
    if (!fallbackPath) {
      return new Response('Not found', { status: 404 });
    }

    try {
      return await readLocalFileResponse(fallbackPath);
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }
}

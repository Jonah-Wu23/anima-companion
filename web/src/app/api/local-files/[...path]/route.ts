import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { NextRequest } from 'next/server';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const ALLOWED_ROOTS = new Set(['assets', 'configs']);
const CACHE_CONTROL_HEADER = 'public, max-age=86400, stale-while-revalidate=604800';
const MIN_COMPRESS_SIZE_BYTES = 1024;
const gzipAsync = promisify(gzip);
const brotliCompressAsync = promisify(brotliCompress);

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
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

type ContentEncoding = 'br' | 'gzip' | 'identity';

const COMPRESSIBLE_EXTENSIONS = new Set([
  '.pmx',
  '.vmd',
  '.bmp',
  '.tga',
  '.json',
  '.yaml',
  '.yml',
  '.txt',
  '.js',
  '.mjs',
  '.wasm',
]);

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

function parseAcceptedEncoding(headerValue: string | null): ContentEncoding {
  if (!headerValue) {
    return 'identity';
  }

  const accepted = headerValue.toLowerCase();
  if (accepted.includes('br')) {
    return 'br';
  }
  if (accepted.includes('gzip')) {
    return 'gzip';
  }
  return 'identity';
}

function canCompress(filePath: string, size: number): boolean {
  if (size < MIN_COMPRESS_SIZE_BYTES) {
    return false;
  }
  return COMPRESSIBLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function createHeaders(filePath: string, bodySize: number, contentEncoding: ContentEncoding): Headers {
  const headers = new Headers({
    'Content-Type': getContentType(filePath),
    'Cache-Control': CACHE_CONTROL_HEADER,
    Vary: 'Accept-Encoding',
    'Content-Length': String(bodySize),
  });

  if (contentEncoding !== 'identity') {
    headers.set('Content-Encoding', contentEncoding);
  }

  return headers;
}

function toBody(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const body = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  body.set(buffer);
  return body;
}

async function readPrecompressedSidecar(
  filePath: string,
  sourceMtimeMs: number,
  contentEncoding: Exclude<ContentEncoding, 'identity'>
): Promise<Buffer | null> {
  const sidecarPath = `${filePath}${contentEncoding === 'br' ? '.br' : '.gz'}`;
  try {
    const sidecarStat = await stat(sidecarPath);
    if (!sidecarStat.isFile()) {
      return null;
    }
    if (sidecarStat.mtimeMs < sourceMtimeMs) {
      return null;
    }
    return await readFile(sidecarPath);
  } catch {
    return null;
  }
}

async function compressBuffer(buffer: Buffer, contentEncoding: Exclude<ContentEncoding, 'identity'>): Promise<Buffer> {
  if (contentEncoding === 'br') {
    const compressed = await brotliCompressAsync(buffer, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
      },
    });
    return Buffer.isBuffer(compressed) ? compressed : Buffer.from(compressed);
  }

  const compressed = await gzipAsync(buffer, { level: 5 });
  return Buffer.isBuffer(compressed) ? compressed : Buffer.from(compressed);
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

async function readLocalFileResponse(filePath: string, requestHeaders: Headers): Promise<Response> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    return new Response('Not found', { status: 404 });
  }

  const requestEncoding = parseAcceptedEncoding(
    requestHeaders.get('accept-encoding') ?? requestHeaders.get('Accept-Encoding')
  );
  const shouldCompress = requestEncoding !== 'identity' && canCompress(filePath, fileStat.size);
  const compressedEncoding = shouldCompress ? (requestEncoding as Exclude<ContentEncoding, 'identity'>) : null;

  if (compressedEncoding) {
    const sidecarBuffer = await readPrecompressedSidecar(filePath, fileStat.mtimeMs, compressedEncoding);
    if (sidecarBuffer) {
      return new Response(toBody(sidecarBuffer), {
        status: 200,
        headers: createHeaders(filePath, sidecarBuffer.byteLength, compressedEncoding),
      });
    }
  }

  const buffer = await readFile(filePath);
  if (compressedEncoding) {
    try {
      const compressed = await compressBuffer(buffer, compressedEncoding);
      if (compressed.byteLength < buffer.byteLength) {
        return new Response(toBody(compressed), {
          status: 200,
          headers: createHeaders(filePath, compressed.byteLength, compressedEncoding),
        });
      }
    } catch {
      // 压缩失败时回退原始响应。
    }
  }

  return new Response(toBody(buffer), {
    status: 200,
    headers: createHeaders(filePath, buffer.byteLength, 'identity'),
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await context.params;
  const absolutePath = resolveSafePath(pathSegments);
  if (!absolutePath) {
    return new Response('Not found', { status: 404 });
  }

  try {
    return await readLocalFileResponse(absolutePath, request.headers);
  } catch {
    const fallbackPath = await resolveCompatFallback(absolutePath);
    if (!fallbackPath) {
      return new Response('Not found', { status: 404 });
    }

    try {
      return await readLocalFileResponse(fallbackPath, request.headers);
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }
}

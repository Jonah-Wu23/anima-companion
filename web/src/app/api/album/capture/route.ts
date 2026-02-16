import { AlbumPrivacyDisabledError, saveAlbumScreenshot } from '@/lib/server/album-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CAPTURE_SIZE_BYTES = 15 * 1024 * 1024;

function parseInteger(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.round(value);
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ detail: '无效的 multipart/form-data 请求' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return Response.json({ detail: '缺少截图文件 file' }, { status: 400 });
  }

  if (file.size === 0) {
    return Response.json({ detail: '截图文件为空' }, { status: 400 });
  }
  if (file.size > MAX_CAPTURE_SIZE_BYTES) {
    return Response.json({ detail: '截图文件过大，请控制在 15MB 内' }, { status: 413 });
  }

  const title = formData.get('title');
  const width = parseInteger(formData.get('width'));
  const height = parseInteger(formData.get('height'));

  try {
    const snapshot = await saveAlbumScreenshot({
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      originalName: file.name,
      title: typeof title === 'string' ? title : undefined,
      width,
      height,
    });
    return Response.json(snapshot, { status: 201 });
  } catch (error) {
    if (error instanceof AlbumPrivacyDisabledError) {
      return Response.json({ detail: error.message }, { status: 403 });
    }
    return Response.json(
      { detail: error instanceof Error ? error.message : '截图写入相册失败' },
      { status: 500 },
    );
  }
}

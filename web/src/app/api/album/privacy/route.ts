import { setAlbumPrivacyEnabled } from '@/lib/server/album-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PrivacyBody {
  privacy_enabled?: boolean;
}

export async function PATCH(request: Request) {
  let body: PrivacyBody;
  try {
    body = (await request.json()) as PrivacyBody;
  } catch {
    return Response.json({ detail: '请求体不是有效 JSON' }, { status: 400 });
  }

  if (typeof body.privacy_enabled !== 'boolean') {
    return Response.json({ detail: 'privacy_enabled 必须是布尔值' }, { status: 400 });
  }

  try {
    const snapshot = await setAlbumPrivacyEnabled(body.privacy_enabled);
    return Response.json(snapshot, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        detail: error instanceof Error ? error.message : '更新隐私开关失败',
      },
      { status: 500 },
    );
  }
}

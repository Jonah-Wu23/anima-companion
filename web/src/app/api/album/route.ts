import { getAlbumSnapshot } from '@/lib/server/album-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await getAlbumSnapshot();
    return Response.json(snapshot, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        detail: error instanceof Error ? error.message : '读取相册失败',
      },
      { status: 500 },
    );
  }
}

import { AlbumItemNotFoundError, deleteAlbumItem } from '@/lib/server/album-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return Response.json({ detail: '缺少相册条目 id' }, { status: 400 });
  }

  try {
    const snapshot = await deleteAlbumItem(id);
    return Response.json(snapshot, { status: 200 });
  } catch (error) {
    if (error instanceof AlbumItemNotFoundError) {
      return Response.json({ detail: error.message }, { status: 404 });
    }
    return Response.json(
      { detail: error instanceof Error ? error.message : '删除失败' },
      { status: 500 },
    );
  }
}

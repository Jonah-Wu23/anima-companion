import type { AlbumSnapshot } from '@/lib/album/types';

interface CaptureOptions {
  title?: string;
  width?: number;
  height?: number;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload?.detail) {
      return payload.detail;
    }
  } catch {
    // ignore
  }
  return fallback;
}

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) {
    return;
  }
  throw new Error(await readErrorMessage(response, fallback));
}

export const albumApi = {
  async getSnapshot(): Promise<AlbumSnapshot> {
    const response = await fetch('/api/album', { cache: 'no-store' });
    await ensureOk(response, '读取相册失败');
    return (await response.json()) as AlbumSnapshot;
  },

  async setPrivacyEnabled(privacyEnabled: boolean): Promise<AlbumSnapshot> {
    const response = await fetch('/api/album/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privacy_enabled: privacyEnabled }),
    });
    await ensureOk(response, '更新隐私开关失败');
    return (await response.json()) as AlbumSnapshot;
  },

  async deleteItem(id: string): Promise<AlbumSnapshot> {
    const response = await fetch(`/api/album/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await ensureOk(response, '删除相册条目失败');
    return (await response.json()) as AlbumSnapshot;
  },

  async captureScreenshot(blob: Blob, options: CaptureOptions = {}): Promise<AlbumSnapshot> {
    const formData = new FormData();
    formData.append('file', blob, 'capture.png');
    if (options.title) formData.append('title', options.title);
    if (options.width) formData.append('width', String(options.width));
    if (options.height) formData.append('height', String(options.height));

    const response = await fetch('/api/album/capture', {
      method: 'POST',
      body: formData,
    });
    await ensureOk(response, '截图保存失败');
    return (await response.json()) as AlbumSnapshot;
  },
};

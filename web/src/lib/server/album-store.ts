import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AlbumEvent, AlbumItem, AlbumSettings, AlbumSnapshot } from '@/lib/album/types';

interface StoredAlbumItem extends Omit<AlbumItem, 'url'> {}

interface AlbumStoreFile {
  version: number;
  settings: AlbumSettings;
  items: StoredAlbumItem[];
  events: AlbumEvent[];
}

interface CapturePayload {
  buffer: Buffer;
  mimeType?: string;
  originalName?: string;
  title?: string;
  width?: number;
  height?: number;
}

const REPO_ROOT = path.resolve(process.cwd(), '..');
const PHOTOS_DIR = path.resolve(REPO_ROOT, 'assets', 'photos');
const STORE_DIR = path.resolve(REPO_ROOT, 'data', 'album');
const STORE_FILE = path.resolve(STORE_DIR, 'store.json');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_EVENTS = 400;

let ioQueue: Promise<unknown> = Promise.resolve();

export class AlbumPrivacyDisabledError extends Error {
  constructor() {
    super('隐私模式已开启：当前不允许新增相册记录');
    this.name = 'AlbumPrivacyDisabledError';
  }
}

export class AlbumItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`未找到相册条目：${itemId}`);
    this.name = 'AlbumItemNotFoundError';
  }
}

function withIoLock<T>(task: () => Promise<T>): Promise<T> {
  const next = ioQueue.then(task, task);
  ioQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatFileTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function normalizeTitle(raw: string | undefined, fallback: string): string {
  const text = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return text || fallback;
}

function inferMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function inferPhotoTitle(filename: string): string {
  const withoutExt = filename.replace(path.extname(filename), '');
  return withoutExt.replace(/[-_]+/g, ' ').trim() || '回忆片段';
}

function buildPhotoUrl(filename: string): string {
  return `/api/local-files/assets/photos/${encodeURIComponent(filename)}`;
}

function toSnapshot(store: AlbumStoreFile): AlbumSnapshot {
  return {
    settings: store.settings,
    events: [...store.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    items: [...store.items]
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
      .map((item) => ({
        ...item,
        url: buildPhotoUrl(item.filename),
      })),
  };
}

function createDefaultStore(): AlbumStoreFile {
  const createdAt = nowIso();
  return {
    version: 1,
    settings: {
      privacyEnabled: true,
      updatedAt: createdAt,
    },
    items: [],
    events: [],
  };
}

function parseStore(raw: string): AlbumStoreFile {
  const fallback = createDefaultStore();
  try {
    const parsed = JSON.parse(raw) as Partial<AlbumStoreFile>;
    const settings = parsed.settings ?? fallback.settings;
    return {
      version: 1,
      settings: {
        privacyEnabled: typeof settings.privacyEnabled === 'boolean' ? settings.privacyEnabled : true,
        updatedAt: typeof settings.updatedAt === 'string' ? settings.updatedAt : fallback.settings.updatedAt,
      },
      items: Array.isArray(parsed.items) ? (parsed.items as StoredAlbumItem[]) : [],
      events: Array.isArray(parsed.events) ? (parsed.events as AlbumEvent[]) : [],
    };
  } catch {
    return fallback;
  }
}

async function ensureStorageDirs(): Promise<void> {
  await mkdir(PHOTOS_DIR, { recursive: true });
  await mkdir(STORE_DIR, { recursive: true });
}

async function readStore(): Promise<AlbumStoreFile> {
  await ensureStorageDirs();
  try {
    const content = await readFile(STORE_FILE, 'utf8');
    return parseStore(content);
  } catch {
    return createDefaultStore();
  }
}

async function writeStore(store: AlbumStoreFile): Promise<void> {
  await ensureStorageDirs();
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function appendEvent(store: AlbumStoreFile, event: Omit<AlbumEvent, 'id' | 'createdAt'>): void {
  store.events.unshift({
    id: randomUUID(),
    createdAt: nowIso(),
    ...event,
  });
  if (store.events.length > MAX_EVENTS) {
    store.events.length = MAX_EVENTS;
  }
}

async function syncItemsFromDirectory(store: AlbumStoreFile): Promise<boolean> {
  await ensureStorageDirs();
  const entries = await readdir(PHOTOS_DIR, { withFileTypes: true });
  const diskFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()));
  const diskSet = new Set(diskFiles);
  const byFilename = new Map(store.items.map((item) => [item.filename, item]));
  let changed = false;

  for (const filename of diskFiles) {
    const existing = byFilename.get(filename);
    const filePath = path.resolve(PHOTOS_DIR, filename);
    const fileStat = await stat(filePath);
    const capturedAt = fileStat.mtime.toISOString();
    const mimeType = inferMimeType(filename);

    if (!existing) {
      const nextItem: StoredAlbumItem = {
        id: randomUUID(),
        filename,
        title: inferPhotoTitle(filename),
        source: 'imported',
        mimeType,
        sizeBytes: fileStat.size,
        capturedAt,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      store.items.push(nextItem);
      changed = true;
      if (store.settings.privacyEnabled) {
        appendEvent(store, {
          type: 'photo_imported',
          itemId: nextItem.id,
          note: `检测到新图片：${filename}`,
        });
      }
      continue;
    }

    if (
      existing.sizeBytes !== fileStat.size ||
      existing.mimeType !== mimeType ||
      existing.capturedAt !== capturedAt
    ) {
      existing.sizeBytes = fileStat.size;
      existing.mimeType = mimeType;
      existing.capturedAt = capturedAt;
      existing.updatedAt = nowIso();
      changed = true;
    }
  }

  const beforeCount = store.items.length;
  store.items = store.items.filter((item) => diskSet.has(item.filename));
  if (store.items.length !== beforeCount) {
    changed = true;
  }

  return changed;
}

function mimeToExtension(mimeType: string | undefined, originalName: string | undefined): string {
  const lowerMime = String(mimeType || '').toLowerCase();
  if (lowerMime === 'image/png') return '.png';
  if (lowerMime === 'image/webp') return '.webp';
  if (lowerMime === 'image/jpeg' || lowerMime === 'image/jpg') return '.jpg';

  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  return '.png';
}

async function buildUniqueFilename(extension: string): Promise<string> {
  for (let retry = 0; retry < 6; retry += 1) {
    const fileName = `album-shot-${formatFileTimestamp(new Date())}-${randomUUID().slice(0, 8)}${extension}`;
    const fullPath = path.resolve(PHOTOS_DIR, fileName);
    try {
      await stat(fullPath);
    } catch {
      return fileName;
    }
  }
  return `album-shot-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
}

export async function getAlbumSnapshot(): Promise<AlbumSnapshot> {
  return withIoLock(async () => {
    const store = await readStore();
    const changed = await syncItemsFromDirectory(store);
    if (changed) {
      await writeStore(store);
    }
    return toSnapshot(store);
  });
}

export async function setAlbumPrivacyEnabled(privacyEnabled: boolean): Promise<AlbumSnapshot> {
  return withIoLock(async () => {
    const store = await readStore();
    const changedBySync = await syncItemsFromDirectory(store);
    if (store.settings.privacyEnabled !== privacyEnabled) {
      store.settings = {
        privacyEnabled,
        updatedAt: nowIso(),
      };
      appendEvent(store, {
        type: 'privacy_changed',
        note: privacyEnabled ? '隐私开关已关闭，允许记录' : '隐私开关已开启，停止记录',
        payload: { privacyEnabled },
      });
      await writeStore(store);
      return toSnapshot(store);
    }
    if (changedBySync) {
      await writeStore(store);
    }
    return toSnapshot(store);
  });
}

export async function saveAlbumScreenshot(payload: CapturePayload): Promise<AlbumSnapshot> {
  return withIoLock(async () => {
    const store = await readStore();
    const changedBySync = await syncItemsFromDirectory(store);
    if (changedBySync) {
      await writeStore(store);
    }

    if (!store.settings.privacyEnabled) {
      throw new AlbumPrivacyDisabledError();
    }

    const extension = mimeToExtension(payload.mimeType, payload.originalName);
    const filename = await buildUniqueFilename(extension);
    const filePath = path.resolve(PHOTOS_DIR, filename);
    await writeFile(filePath, payload.buffer);
    const fileStat = await stat(filePath);
    const createdAt = nowIso();

    const nextItem: StoredAlbumItem = {
      id: randomUUID(),
      filename,
      title: normalizeTitle(payload.title, '即时截图'),
      source: 'screenshot',
      mimeType: inferMimeType(filename),
      sizeBytes: fileStat.size,
      capturedAt: fileStat.mtime.toISOString(),
      createdAt,
      updatedAt: createdAt,
    };

    store.items.push(nextItem);
    appendEvent(store, {
      type: 'screenshot_captured',
      itemId: nextItem.id,
      note: '用户在主页拍摄截图',
      payload: {
        width: payload.width ?? null,
        height: payload.height ?? null,
      },
    });
    await writeStore(store);
    return toSnapshot(store);
  });
}

export async function deleteAlbumItem(itemId: string): Promise<AlbumSnapshot> {
  return withIoLock(async () => {
    const store = await readStore();
    const changedBySync = await syncItemsFromDirectory(store);
    if (changedBySync) {
      await writeStore(store);
    }

    const index = store.items.findIndex((item) => item.id === itemId);
    if (index < 0) {
      throw new AlbumItemNotFoundError(itemId);
    }

    const [removed] = store.items.splice(index, 1);
    const filePath = path.resolve(PHOTOS_DIR, removed.filename);
    try {
      await unlink(filePath);
    } catch {
      // 文件可能已被人工删除，不阻断数据层删除流程
    }

    appendEvent(store, {
      type: 'item_deleted',
      itemId: itemId,
      note: `已删除图片：${removed.filename}`,
    });
    await writeStore(store);
    return toSnapshot(store);
  });
}

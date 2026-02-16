export type AlbumItemSource = 'imported' | 'screenshot';

export type AlbumEventType =
  | 'photo_imported'
  | 'screenshot_captured'
  | 'item_deleted'
  | 'privacy_changed';

export interface AlbumItem {
  id: string;
  filename: string;
  title: string;
  source: AlbumItemSource;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface AlbumEvent {
  id: string;
  type: AlbumEventType;
  createdAt: string;
  itemId?: string;
  note?: string;
  payload?: Record<string, string | number | boolean | null>;
}

export interface AlbumSettings {
  privacyEnabled: boolean;
  updatedAt: string;
}

export interface AlbumSnapshot {
  items: AlbumItem[];
  events: AlbumEvent[];
  settings: AlbumSettings;
}

import type {
  MotionManifestCandidate,
  MotionManifestDocument,
  MotionState,
} from '@/lib/api/types';

const DEFAULT_MANIFEST_URL = '/api/local-files/configs/motions/phainon-motion-manifest.json';
type ManifestStateKey = 'Idle' | 'Speaking' | 'Listening' | 'Thinking' | 'Error';

const RAW_TO_MOTION: Record<ManifestStateKey, MotionState> = {
  Idle: 'idle',
  Speaking: 'speaking',
  Listening: 'listening',
  Thinking: 'thinking',
  Error: 'error',
};

const MOTION_TO_RAW: Record<MotionState, ManifestStateKey> = {
  idle: 'Idle',
  speaking: 'Speaking',
  listening: 'Listening',
  thinking: 'Thinking',
  error: 'Error',
};

interface RawManifestState {
  candidates?: MotionManifestCandidate[];
}

interface RawManifestDocument {
  version?: number;
  validated_at?: string;
  states?: Record<string, RawManifestState>;
}

export class MotionManifestLoader {
  private document: MotionManifestDocument | null = null;

  constructor(private readonly manifestUrl = DEFAULT_MANIFEST_URL) {}

  async load(forceReload = false): Promise<MotionManifestDocument> {
    if (!forceReload && this.document) {
      return this.document;
    }

    const response = await fetch(encodeURI(this.manifestUrl));
    if (!response.ok) {
      throw new Error(`动作清单加载失败 (${response.status})`);
    }

    const parsed = (await response.json()) as RawManifestDocument;
    this.document = this.normalizeDocument(parsed);
    return this.document;
  }

  getCandidates(state: MotionState, includeFallback = true): MotionManifestCandidate[] {
    if (!this.document) {
      return [];
    }

    const rawState = MOTION_TO_RAW[state];
    const candidates = this.document.states?.[rawState]?.candidates ?? [];
    const sorted = [...candidates].sort((a, b) => a.priority - b.priority);
    return includeFallback ? sorted : sorted.filter((candidate) => !candidate.fallback);
  }

  resolveBestCandidate(
    state: MotionState,
    options?: {
      includeFallback?: boolean;
    }
  ): MotionManifestCandidate | undefined {
    const includeFallback = options?.includeFallback ?? true;
    const primary = this.getCandidates(state, false)[0];
    if (primary) {
      return primary;
    }
    if (!includeFallback) {
      return undefined;
    }
    return this.getCandidates(state, true)[0];
  }

  resolvePublicPath(rawPath: string): string {
    if (!rawPath) {
      return rawPath;
    }
    if (/^(https?:)?\/\//i.test(rawPath)) {
      return encodeURI(rawPath);
    }
    if (rawPath.startsWith('/')) {
      return encodeURI(rawPath);
    }

    const normalized = rawPath.replace(/\\/g, '/').replace(/^\.?\//, '');
    if (normalized.startsWith('assets/') || normalized.startsWith('configs/')) {
      return encodeURI(`/api/local-files/${normalized}`);
    }
    return encodeURI(`/api/local-files/assets/${normalized}`);
  }

  private normalizeDocument(raw: RawManifestDocument): MotionManifestDocument {
    const normalizedStates: MotionManifestDocument['states'] = {};

    Object.entries(raw.states ?? {}).forEach(([rawStateKey, stateNode]) => {
      const rawState = rawStateKey as ManifestStateKey;
      const mappedState = RAW_TO_MOTION[rawState];
      if (!mappedState) {
        return;
      }

      const normalizedCandidates = (stateNode.candidates ?? [])
        .filter((candidate) => candidate.asset_id && candidate.path)
        .map((candidate) => ({
          asset_id: candidate.asset_id,
          path: candidate.path,
          priority: Number.isFinite(candidate.priority) ? candidate.priority : 999,
          fallback: Boolean(candidate.fallback),
          risk: candidate.risk,
        }))
        .sort((a, b) => a.priority - b.priority);

      normalizedStates[rawState] = { candidates: normalizedCandidates };
    });

    return {
      version: Number.isFinite(raw.version) ? Number(raw.version) : 1,
      validated_at: raw.validated_at,
      states: normalizedStates,
    };
  }
}

export { DEFAULT_MANIFEST_URL };

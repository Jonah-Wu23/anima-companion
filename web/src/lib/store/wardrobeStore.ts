import { create } from 'zustand';
import type { ModelInfo } from '../wardrobe/model-registry';
import { getDefaultModel, getModelById } from '../wardrobe/model-registry';

export type WardrobeStatus = 
  | 'idle'           // 空闲状态
  | 'loading'        // 正在加载模型
  | 'previewing'     // 预览模式
  | 'switching'      // 正在切换模型
  | 'error';         // 错误状态

export interface WardrobeState {
  // Current selection
  currentModelId: string;
  previewModelId: string | null;
  
  // Status
  status: WardrobeStatus;
  loadingProgress: number;
  errorMessage: string | null;
  
  // UI State
  isSidebarOpen: boolean;
  selectedCategory: string | null;
  searchQuery: string;
  
  // History
  recentModelIds: string[];
  
  // Actions
  setCurrentModel: (modelId: string) => void;
  setPreviewModel: (modelId: string | null) => void;
  setStatus: (status: WardrobeStatus) => void;
  setLoadingProgress: (progress: number) => void;
  setErrorMessage: (message: string | null) => void;
  
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedCategory: (category: string | null) => void;
  setSearchQuery: (query: string) => void;
  
  addToRecent: (modelId: string) => void;
  clearRecent: () => void;
  
  // Async actions
  switchModel: (modelId: string) => Promise<void>;
  confirmPreview: () => void;
  cancelPreview: () => void;
  reset: () => void;
}

const MAX_RECENT_ITEMS = 5;

export const useWardrobeStore = create<WardrobeState>((set, get) => ({
  // Initial state
  currentModelId: getDefaultModel().id,
  previewModelId: null,
  status: 'idle',
  loadingProgress: 0,
  errorMessage: null,
  isSidebarOpen: true,
  selectedCategory: null,
  searchQuery: '',
  recentModelIds: [],
  
  // Actions
  setCurrentModel: (modelId) => {
    const model = getModelById(modelId);
    if (model && model.isAvailable) {
      set({ currentModelId: modelId, previewModelId: null });
      get().addToRecent(modelId);
    }
  },
  
  setPreviewModel: (modelId) => set({ previewModelId: modelId }),
  
  setStatus: (status) => set({ status }),
  
  setLoadingProgress: (progress) => {
    const safeProgress = Number.isFinite(progress) ? progress : 0;
    set({ loadingProgress: Math.min(100, Math.max(0, safeProgress)) });
  },
  
  setErrorMessage: (message) => set({ errorMessage: message }),
  
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  addToRecent: (modelId) => {
    set((state) => {
      const filtered = state.recentModelIds.filter((id) => id !== modelId);
      return {
        recentModelIds: [modelId, ...filtered].slice(0, MAX_RECENT_ITEMS),
      };
    });
  },
  
  clearRecent: () => set({ recentModelIds: [] }),
  
  // Async actions
  switchModel: async (modelId) => {
    const model = getModelById(modelId);
    if (!model || !model.isAvailable) {
      set({ errorMessage: '模型不可用', status: 'error' });
      return;
    }
    
    if (modelId === get().currentModelId) {
      return; // Already current model
    }
    
    set({
      status: 'switching',
      loadingProgress: 0,
      errorMessage: null,
      currentModelId: modelId,
      previewModelId: null,
    });
    
    try {
      // 让 UI 至少经过一帧，避免状态瞬时切换导致的闪烁。
      if (typeof window !== 'undefined') {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      }

      set({
        status: 'idle',
      });

      get().addToRecent(modelId);
    } catch (error) {
      set({ 
        status: 'error', 
        errorMessage: error instanceof Error ? error.message : '模型切换失败',
        loadingProgress: 0,
      });
    }
  },
  
  confirmPreview: () => {
    const { previewModelId } = get();
    if (previewModelId) {
      get().switchModel(previewModelId);
    }
  },
  
  cancelPreview: () => {
    set({ previewModelId: null, status: 'idle', errorMessage: null });
  },
  
  reset: () => set({
    previewModelId: null,
    status: 'idle',
    loadingProgress: 0,
    errorMessage: null,
    searchQuery: '',
    selectedCategory: null,
  }),
}));

export const selectCurrentModel = (state: WardrobeState): ModelInfo => {
  return getModelById(state.currentModelId) ?? getDefaultModel();
};

export const selectPreviewModel = (state: WardrobeState): ModelInfo | null => {
  if (!state.previewModelId) return null;
  return getModelById(state.previewModelId) ?? null;
};

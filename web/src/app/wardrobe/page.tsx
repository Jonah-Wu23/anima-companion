'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, X, ChevronLeft, ChevronRight, Loader2, Check, Sparkles } from 'lucide-react';
import { selectCurrentModel, selectPreviewModel, useWardrobeStore } from '@/lib/store/wardrobeStore';
import { AVAILABLE_MODELS, getAvailableModels } from '@/lib/wardrobe/model-registry';
import { ModelCard } from '@/components/wardrobe/ModelCard';
import { ModelPreview } from '@/components/wardrobe/ModelPreview';
import { LoadingOverlay } from '@/components/wardrobe/LoadingOverlay';
import { cn } from '@/lib/utils';

// Animation keyframes
const pageStyles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
    }
    50% {
      box-shadow: 0 0 40px rgba(56, 189, 248, 0.5);
    }
  }
  
  .animate-fadeInUp {
    animation: fadeInUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }
  
  .animate-slideInRight {
    animation: slideInRight 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }
  
  .animate-pulse-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }
  
  .stagger-1 { animation-delay: 0.05s; }
  .stagger-2 { animation-delay: 0.1s; }
  .stagger-3 { animation-delay: 0.15s; }
  .stagger-4 { animation-delay: 0.2s; }
`;

// Categories derived from tags
const CATEGORIES = [
  { id: 'all', name: '全部', icon: Sparkles },
  { id: '基础', name: '基础', icon: null },
  { id: '变身', name: '变身', icon: null },
  { id: '制服', name: '制服', icon: null },
  { id: '女士', name: '女士', icon: null },
  { id: '联动', name: '联动', icon: null },
  { id: '娘化', name: '娘化', icon: null },
];

export default function WardrobePage() {
  const currentModel = useWardrobeStore(selectCurrentModel);
  const previewModel = useWardrobeStore(selectPreviewModel);
  const {
    status,
    loadingProgress,
    errorMessage,
    isSidebarOpen,
    selectedCategory,
    searchQuery,
    recentModelIds,
    setPreviewModel,
    setSelectedCategory,
    setSearchQuery,
    switchModel,
    confirmPreview,
    cancelPreview,
    setSidebarOpen,
    setStatus,
    setLoadingProgress,
    setErrorMessage,
  } = useWardrobeStore();

  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    if (status === 'switching') {
      setStatus('idle');
      setLoadingProgress(0);
      setErrorMessage(null);
    }
  }, [setErrorMessage, setLoadingProgress, setStatus, status]);

  // Filter models based on category and search
  const filteredModels = useMemo(() => {
    let models = getAvailableModels();
    
    // Filter by category
    if (selectedCategory && selectedCategory !== 'all') {
      models = models.filter((model) => 
        model.tags.includes(selectedCategory)
      );
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      models = models.filter((model) =>
        model.name.toLowerCase().includes(query) ||
        model.description.toLowerCase().includes(query) ||
        model.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }
    
    return models;
  }, [selectedCategory, searchQuery]);

  // Get recent models
  const recentModels = useMemo(() => {
    return recentModelIds
      .map((id) => AVAILABLE_MODELS.find((m) => m.id === id))
      .filter(Boolean);
  }, [recentModelIds]);

  // Handle model selection
  const handleSelectModel = useCallback((modelId: string) => {
    if (status === 'switching') return;
    
    if (modelId === currentModel.id) {
      // Already current, just clear preview
      cancelPreview();
    } else {
      // Set preview
      setPreviewModel(modelId);
    }
  }, [currentModel.id, status, setPreviewModel, cancelPreview]);

  // Handle confirm
  const handleConfirm = useCallback(async () => {
    if (previewModel && previewModel.id !== currentModel.id) {
      await switchModel(previewModel.id);
    }
  }, [previewModel, currentModel.id, switchModel]);

  // Display model (preview takes precedence)
  const displayModel = previewModel || currentModel;
  const isPreview = !!previewModel && previewModel.id !== currentModel.id;

  return (
    <>
      <style>{pageStyles}</style>
      
      <main className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-white to-sky-50/30 text-slate-800 overflow-hidden">
        {/* Loading Overlay */}
        <LoadingOverlay 
          isVisible={status === 'switching'} 
          progress={loadingProgress}
          message="正在更换服装..."
        />
        
        <div className="flex h-[100dvh]">
          {/* Sidebar - Model Selector */}
          <aside 
            className={cn(
              'flex flex-col bg-white/80 backdrop-blur-xl border-r border-slate-200/60',
              'transition-all duration-300 ease-spring',
              isSidebarOpen ? 'w-full lg:w-96' : 'w-0 overflow-hidden'
            )}
          >
            {/* Header */}
            <header className="flex-none px-6 py-5 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-600 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  返回陪伴页面
                </Link>
              </div>
              
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <span className="relative">
                  换装间
                  <span className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 to-cyan-400 rounded-full opacity-60" />
                </span>
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                为白厄挑选不同的装扮
              </p>
            </header>

            {/* Search */}
            <div className="flex-none px-6 py-4">
              <div 
                className={cn(
                  'relative flex items-center',
                  'bg-slate-100 rounded-xl transition-all duration-200',
                  isSearchFocused && 'ring-2 ring-sky-400/50 bg-white shadow-sm'
                )}
              >
                <Search className={cn(
                  'absolute left-3 w-4 h-4 transition-colors',
                  isSearchFocused ? 'text-sky-500' : 'text-slate-400'
                )} />
                <input
                  type="text"
                  placeholder="搜索装扮..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  className="w-full pl-10 pr-10 py-2.5 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Categories */}
            <div className="flex-none px-6 pb-4">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                {CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id === 'all' ? null : category.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all',
                      (selectedCategory === category.id) || (!selectedCategory && category.id === 'all')
                        ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {category.icon && <category.icon className="w-3.5 h-3.5" />}
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Model List */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {/* Recent Section */}
              {recentModels.length > 0 && !searchQuery && !selectedCategory && (
                <div className="mb-6 animate-fadeInUp">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    最近使用
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {recentModels.slice(0, 4).map((model, index) => (
                      model && (
                        <ModelCard
                          key={model.id}
                          model={model}
                          isActive={model.id === currentModel.id}
                          isPreview={model.id === previewModel?.id}
                          onClick={() => handleSelectModel(model.id)}
                          className={`stagger-${index + 1}`}
                        />
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* All Models */}
              <div className="animate-fadeInUp stagger-1">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  {searchQuery ? '搜索结果' : '全部装扮'}
                </h3>
                
                {filteredModels.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                      <Search className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-500 mb-1">未找到匹配的装扮</p>
                    <p className="text-sm text-slate-400">尝试更换搜索词或筛选条件</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredModels.map((model, index) => (
                      <ModelCard
                        key={model.id}
                        model={model}
                        isActive={model.id === currentModel.id}
                        isPreview={model.id === previewModel?.id}
                        onClick={() => handleSelectModel(model.id)}
                        style={{ animationDelay: `${index * 0.03}s` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Mobile Toggle Button (only visible on mobile) */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center border border-slate-200"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
          </aside>

          {/* Main Preview Area */}
          <section className="flex-1 relative bg-gradient-to-br from-sky-50/50 via-white to-cyan-50/30">
            {/* Sidebar Toggle (when closed) */}
            {!isSidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg flex items-center justify-center border border-slate-200/60 hover:scale-105 transition-transform"
              >
                <ChevronRight className="w-5 h-5 text-slate-600" />
              </button>
            )}

            {/* Model Preview */}
            <ModelPreview 
              model={displayModel}
              isPreview={isPreview}
            />

            {/* Preview Actions */}
            {isPreview && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 animate-slideInRight">
                <button
                  onClick={cancelPreview}
                  className={cn(
                    'px-6 py-3 rounded-xl font-medium transition-all',
                    'bg-white/90 backdrop-blur text-slate-700 border border-slate-200',
                    'hover:bg-white hover:shadow-lg'
                  )}
                >
                  取消
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={status === 'switching'}
                  className={cn(
                    'px-6 py-3 rounded-xl font-medium transition-all',
                    'bg-gradient-to-r from-sky-500 to-cyan-500 text-white',
                    'hover:shadow-lg hover:shadow-sky-500/30 hover:scale-105',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center gap-2'
                  )}
                >
                  {status === 'switching' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      更换中...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      确认更换
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-rose-500 text-white rounded-full text-sm shadow-lg animate-fadeInUp">
                {errorMessage}
              </div>
            )}

            {/* Current Model Indicator */}
            {!isPreview && (
              <div className="absolute top-6 left-6 px-4 py-2 bg-white/80 backdrop-blur rounded-xl border border-slate-200/60 shadow-sm animate-fadeInUp">
                <p className="text-xs text-slate-500">当前装扮</p>
                <p className="font-semibold text-slate-800">{currentModel.name}</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

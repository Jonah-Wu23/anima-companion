'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw, Shield, ShieldCheck, AlertCircle, Camera } from 'lucide-react';
import { albumApi } from '@/lib/album/client';
import type { AlbumItem, AlbumSnapshot } from '@/lib/album/types';
import { GalleryGrid } from '@/components/album/GalleryGrid';
import { Lightbox } from '@/components/album/Lightbox';
import { FilterBar, type FilterType } from '@/components/album/FilterBar';
import { EventTimeline } from '@/components/album/EventTimeline';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';

// Animation keyframes for page entrance
const pageEntranceStyles = `
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
  
  .animate-fadeInUp {
    animation: fadeInUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }
  
  .stagger-1 { animation-delay: 0.05s; }
  .stagger-2 { animation-delay: 0.1s; }
  .stagger-3 { animation-delay: 0.15s; }
  .stagger-4 { animation-delay: 0.2s; }
`;

export default function AlbumPage() {
  // Data state
  const [snapshot, setSnapshot] = useState<AlbumSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // UI state
  const [filter, setFilter] = useState<FilterType>('all');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [lightboxItem, setLightboxItem] = useState<AlbumItem | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Load data
  const loadSnapshot = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextSnapshot = await albumApi.getSnapshot();
      setSnapshot(nextSnapshot);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载相册失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  // Derived data
  const privacyEnabled = snapshot?.settings.privacyEnabled ?? true;
  const privacyProtectionEnabled = !privacyEnabled;
  const allItems = useMemo(() => snapshot?.items ?? [], [snapshot?.items]);
  const events = useMemo(() => snapshot?.events ?? [], [snapshot?.events]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (filter === 'all') return allItems;
    return allItems.filter((item) => item.source === filter);
  }, [allItems, filter]);

  // Lightbox navigation
  const currentLightboxIndex = useMemo(() => {
    if (!lightboxItem) return -1;
    return filteredItems.findIndex((item) => item.id === lightboxItem.id);
  }, [lightboxItem, filteredItems]);

  const handlePrevImage = useCallback(() => {
    if (currentLightboxIndex > 0) {
      setLightboxItem(filteredItems[currentLightboxIndex - 1]);
    }
  }, [currentLightboxIndex, filteredItems]);

  const handleNextImage = useCallback(() => {
    if (currentLightboxIndex < filteredItems.length - 1) {
      setLightboxItem(filteredItems[currentLightboxIndex + 1]);
    }
  }, [currentLightboxIndex, filteredItems]);

  // Handlers
  const handlePrivacyToggle = useCallback(
    async (nextValue: boolean) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      setError(null);
      try {
        const nextSnapshot = await albumApi.setPrivacyEnabled(nextValue);
        setSnapshot(nextSnapshot);
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : '更新隐私开关失败');
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting]
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (isSubmitting) return;
      
      // Optimistic UI: mark as deleting
      setDeletingIds((prev) => new Set(prev).add(itemId));
      setIsSubmitting(true);
      setError(null);
      
      try {
        const nextSnapshot = await albumApi.deleteItem(itemId);
        setSnapshot(nextSnapshot);
        
        // Close lightbox if deleting current item
        if (lightboxItem?.id === itemId) {
          setLightboxOpen(false);
          setLightboxItem(null);
        }
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : '删除失败');
        // Remove from deleting set on error
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      } finally {
        setIsSubmitting(false);
        // Clean up deleting set after animation
        setTimeout(() => {
          setDeletingIds((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
        }, 300);
      }
    },
    [isSubmitting, lightboxItem]
  );

  const handleViewItem = useCallback((item: AlbumItem) => {
    setLightboxItem(item);
    setLightboxOpen(true);
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightboxOpen(false);
    setTimeout(() => setLightboxItem(null), 300);
  }, []);

  // Render helpers
  const isEmpty = !isLoading && allItems.length === 0;
  const isFilteredEmpty = !isLoading && filteredItems.length === 0 && filter !== 'all';

  return (
    <>
      <style>{pageEntranceStyles}</style>
      
      <main className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-white to-sky-50/30 text-slate-800">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
          
          {/* Header */}
          <header className="animate-fadeInUp">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Left: Title & Back */}
              <div className="space-y-1">
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-600 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  返回陪伴页面
                </Link>
                <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 flex items-center gap-3">
                  <span className="relative">
                    回忆相册
                    <span className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 to-cyan-400 rounded-full opacity-60" />
                  </span>
                  {allItems.length > 0 && (
                    <span className="text-base font-normal text-slate-400">
                      ({allItems.length})
                    </span>
                  )}
                </h1>
              </div>

              {/* Right: Actions */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Refresh button */}
                <button
                  type="button"
                  onClick={() => void loadSnapshot()}
                  disabled={isLoading || isSubmitting}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl',
                    'bg-white border border-slate-200 text-slate-600',
                    'hover:bg-slate-50 hover:border-slate-300',
                    'transition-all duration-200',
                    'disabled:opacity-50'
                  )}
                >
                  <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
                  <span className="text-sm font-medium hidden sm:inline">刷新</span>
                </button>

                {/* Privacy toggle */}
                <div
                  className={cn(
                    'inline-flex items-center gap-3 px-4 py-2 rounded-xl',
                    'bg-white border transition-all duration-200',
                    privacyProtectionEnabled
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-amber-200 bg-amber-50/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {privacyProtectionEnabled ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Shield className="w-4 h-4 text-amber-600" />
                    )}
                    <span className={cn(
                      'text-sm font-medium',
                      privacyProtectionEnabled ? 'text-emerald-700' : 'text-amber-700'
                    )}>
                      {privacyProtectionEnabled ? '隐私保护开启' : '隐私保护关闭'}
                    </span>
                  </div>
                  <Switch
                    checked={privacyProtectionEnabled}
                    onCheckedChange={(checked) => void handlePrivacyToggle(!checked)}
                    disabled={isSubmitting}
                    aria-label="隐私保护开关"
                  />
                </div>
              </div>
            </div>

            {/* Privacy description */}
            <p className="mt-3 text-sm text-slate-500">
              与白厄的每一个珍贵瞬间都会安全保存在这里。开启隐私保护后，新截图将不会被记录。
            </p>
          </header>

          {/* Error message */}
          {error && (
            <div className="mt-6 animate-fadeInUp stagger-1">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-xs font-medium hover:underline"
                >
                   dismiss
                </button>
              </div>
            </div>
          )}

          {/* Main content */}
          <div className="mt-8 grid lg:grid-cols-[1fr_320px] gap-6">
            
            {/* Left: Gallery */}
            <section className="space-y-4 animate-fadeInUp stagger-2">
              {/* Filter bar */}
              {!isEmpty && (
                <div className="flex items-center justify-between">
                  <FilterBar
                    currentFilter={filter}
                    onFilterChange={setFilter}
                    totalCount={allItems.length}
                    filteredCount={filteredItems.length}
                  />
                </div>
              )}

              {/* Loading state */}
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin mb-4" />
                  <p className="text-slate-500">正在加载回忆...</p>
                </div>
              )}

              {/* Gallery grid */}
              {!isLoading && (
                <>
                  {isFilteredEmpty ? (
                    <div className="text-center py-16">
                      <Camera className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-slate-700 mb-1">
                        没有符合条件的回忆
                      </h3>
                      <p className="text-sm text-slate-500">
                        尝试切换其他筛选条件
                      </p>
                      <button
                        onClick={() => setFilter('all')}
                        className="mt-4 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors"
                      >
                        查看全部
                      </button>
                    </div>
                  ) : (
                    <GalleryGrid
                      items={filteredItems}
                      deletingIds={deletingIds}
                      onDelete={handleDeleteItem}
                      onView={handleViewItem}
                    />
                  )}
                </>
              )}
            </section>

            {/* Right: Event timeline */}
            <aside className="space-y-4 animate-fadeInUp stagger-3">
              <div className="lg:sticky lg:top-6">
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-800">事件记录</h2>
                    <p className="text-xs text-slate-500 mt-0.5">最近 10 条操作记录</p>
                  </div>
                  <div className="px-5 py-3">
                    <EventTimeline events={events} maxItems={10} />
                  </div>
                </div>

                {/* Quick tip */}
                <div className="mt-4 p-4 rounded-xl bg-sky-50/50 border border-sky-100">
                  <div className="flex items-start gap-3">
                    <Camera className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-sky-900">快捷截图</h4>
                      <p className="text-xs text-sky-700/70 mt-1">
                        在陪伴页面点击顶部相机图标，即可保存当前画面到相册。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* Lightbox */}
      <Lightbox
        item={lightboxItem}
        isOpen={lightboxOpen}
        onClose={handleCloseLightbox}
        onPrev={handlePrevImage}
        onNext={handleNextImage}
        onDelete={handleDeleteItem}
        hasPrev={currentLightboxIndex > 0}
        hasNext={currentLightboxIndex < filteredItems.length - 1}
      />
    </>
  );
}

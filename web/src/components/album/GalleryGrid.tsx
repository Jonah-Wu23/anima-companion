'use client';

import React, { useMemo, useCallback } from 'react';
import { AlbumCard } from './AlbumCard';
import { TimeGroupHeader } from './TimeGroupHeader';
import type { AlbumItem } from '@/lib/album/types';
import { cn } from '@/lib/utils';

interface GalleryGridProps {
  items: AlbumItem[];
  deletingIds: Set<string>;
  onDelete: (id: string) => void;
  onView: (item: AlbumItem) => void;
  className?: string;
}

interface GroupedItems {
  date: Date;
  items: AlbumItem[];
}

function groupItemsByDate(items: AlbumItem[]): GroupedItems[] {
  const groups = new Map<string, GroupedItems>();
  
  items.forEach((item) => {
    const date = new Date(item.capturedAt);
    const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    
    if (!groups.has(key)) {
      groups.set(key, {
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        items: [],
      });
    }
    
    groups.get(key)!.items.push(item);
  });
  
  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function GalleryGrid({
  items,
  deletingIds,
  onDelete,
  onView,
  className,
}: GalleryGridProps) {
  const groupedItems = useMemo(() => groupItemsByDate(items), [items]);

  if (items.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-20', className)}>
        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <svg
            className="w-10 h-10 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-700 mb-1">暂无回忆</h3>
        <p className="text-sm text-slate-500 text-center max-w-xs">
          在陪伴页面互动时，点击截图按钮保存美好瞬间
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {groupedItems.map((group, groupIndex) => (
        <section key={group.date.toISOString()} className="space-y-4">
          <TimeGroupHeader
            date={group.date}
            count={group.items.length}
            isFirst={groupIndex === 0}
          />
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {group.items.map((item, itemIndex) => {
              const globalIndex = groupedItems
                .slice(0, groupIndex)
                .reduce((sum, g) => sum + g.items.length, 0) + itemIndex;
              
              return (
                <AlbumCard
                  key={item.id}
                  item={item}
                  index={globalIndex}
                  onDelete={onDelete}
                  onView={onView}
                  isDeleting={deletingIds.has(item.id)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

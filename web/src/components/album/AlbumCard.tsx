'use client';

import React, { useState, useCallback } from 'react';
import { Calendar, Clock, Camera, FolderOpen, Trash2, Eye } from 'lucide-react';
import type { AlbumItem } from '@/lib/album/types';
import { cn } from '@/lib/utils';

interface AlbumCardProps {
  item: AlbumItem;
  index: number;
  onDelete: (id: string) => void;
  onView: (item: AlbumItem) => void;
  isDeleting?: boolean;
}

function formatCardTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  if (isYesterday) {
    return '昨天';
  }
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function getSourceBadge(source: string): { icon: React.ReactNode; label: string; className: string } {
  switch (source) {
    case 'screenshot':
      return {
        icon: <Camera className="w-3 h-3" />,
        label: '截图',
        className: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
      };
    case 'imported':
      return {
        icon: <FolderOpen className="w-3 h-3" />,
        label: '导入',
        className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      };
    default:
      return {
        icon: <Clock className="w-3 h-3" />,
        label: '未知',
        className: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
      };
  }
}

export function AlbumCard({ item, index, onDelete, onView, isDeleting = false }: AlbumCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const sourceBadge = getSourceBadge(item.source);
  const fileSize = Math.max(1, Math.round(item.sizeBytes / 1024));

  const handleDelete = useCallback(() => {
    onDelete(item.id);
    setShowDeleteConfirm(false);
  }, [item.id, onDelete]);

  // Staggered animation delay based on index
  const animationDelay = Math.min(index * 50, 500);

  return (
    <article
      className={cn(
        'group relative',
        'bg-white rounded-2xl overflow-hidden',
        'border border-slate-200/60',
        'shadow-sm hover:shadow-xl',
        'transition-all duration-300 ease-out',
        'focus-within:ring-2 focus-within:ring-sky-500/50 focus-within:border-sky-500/30',
        isDeleting && 'scale-95 opacity-0 translate-y-4'
      )}
      style={{
        animationDelay: `${animationDelay}ms`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image container */}
      <div 
        className="relative aspect-[4/3] overflow-hidden bg-slate-100 cursor-pointer"
        onClick={() => onView(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onView(item);
          }
        }}
        aria-label={`查看图片: ${item.title}`}
      >
        {/* Loading placeholder */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin" />
          </div>
        )}
        
        <img
          src={item.url}
          alt={item.title}
          className={cn(
            'w-full h-full object-cover',
            'transition-all duration-500 ease-out',
            'group-hover:scale-105',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={() => setImageLoaded(true)}
          loading="lazy"
        />

        {/* Hover overlay */}
        <div
          className={cn(
            'absolute inset-0',
            'bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent',
            'flex flex-col justify-end p-4',
            'transition-opacity duration-300',
            isHovered ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(item);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                'bg-white/20 text-white text-xs font-medium',
                'backdrop-blur-md',
                'hover:bg-white/30',
                'transition-colors duration-200'
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              查看
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                'bg-rose-500/80 text-white text-xs font-medium',
                'backdrop-blur-md',
                'hover:bg-rose-500',
                'transition-colors duration-200'
              )}
              aria-label="删除图片"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除
            </button>
          </div>
        </div>

        {/* Source badge */}
        <div
          className={cn(
            'absolute top-3 left-3',
            'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
            'backdrop-blur-md border',
            'bg-white/90 text-slate-700 border-white/50',
            'transition-transform duration-300',
            isHovered ? 'translate-y-0' : 'translate-y-0'
          )}
        >
          {sourceBadge.icon}
          <span>{sourceBadge.label}</span>
        </div>
      </div>

      {/* Info section */}
      <div className="p-4 space-y-2">
        <h3 className="font-medium text-slate-800 line-clamp-1 text-sm leading-tight">
          {item.title}
        </h3>
        
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{formatCardTime(item.capturedAt)}</span>
          </div>
          <span className="text-slate-400">{fileSize} KB</span>
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-4 animate-fadeIn">
          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-3">
            <Trash2 className="w-6 h-6 text-rose-500" />
          </div>
          <p className="text-sm font-medium text-slate-800 mb-1">确认删除？</p>
          <p className="text-xs text-slate-500 text-center mb-4">此操作不可撤销</p>
          <div className="flex gap-2 w-full">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2 px-3 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 py-2 px-3 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition-colors"
            >
              删除
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Trash2, Shield, Download } from 'lucide-react';
import type { AlbumItem } from '@/lib/album/types';
import { cn } from '@/lib/utils';

interface LightboxProps {
  item: AlbumItem | null;
  isOpen: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDelete?: (id: string) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

function formatDetailedTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
  
  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) return `今天 ${timeStr}`;
  if (isYesterday) return `昨天 ${timeStr}`;
  
  return date.toLocaleString('zh-CN', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function getSourceLabel(source: string): { label: string; icon: string; color: string } {
  switch (source) {
    case 'screenshot':
      return { label: '截图', icon: '📸', color: 'text-sky-600 bg-sky-50' };
    case 'imported':
      return { label: '导入', icon: '📁', color: 'text-amber-600 bg-amber-50' };
    default:
      return { label: '未知', icon: '📎', color: 'text-slate-600 bg-slate-50' };
  }
}

export function Lightbox({
  item,
  isOpen,
  onClose,
  onPrev,
  onNext,
  onDelete,
  hasPrev = false,
  hasNext = false,
}: LightboxProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  const handleDelete = useCallback(() => {
    if (item && onDelete) {
      onDelete(item.id);
      setShowDeleteConfirm(false);
      handleClose();
    }
  }, [item, onDelete, handleClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          handleClose();
          break;
        case 'ArrowLeft':
          if (hasPrev && onPrev) onPrev();
          break;
        case 'ArrowRight':
          if (hasNext && onNext) onNext();
          break;
        case 'Delete':
        case 'Backspace':
          if (onDelete && item) setShowDeleteConfirm(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, hasPrev, hasNext, onPrev, onNext, onDelete, item]);

  // Focus trap
  useEffect(() => {
    if (isOpen && containerRef.current) {
      containerRef.current.focus();
    }
  }, [isOpen]);

  // Reset loading state when item changes
  useEffect(() => {
    if (item) {
      setIsImageLoading(true);
    }
  }, [item?.id, item]);

  if (!isOpen || !item) return null;

  const source = getSourceLabel(item.source);
  const fileSize = Math.max(1, Math.round(item.sizeBytes / 1024));

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center',
        'transition-all duration-300 ease-out',
        isClosing ? 'opacity-0' : 'opacity-100'
      )}
      aria-modal="true"
      role="dialog"
      aria-label={`查看图片: ${item.title}`}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-slate-950/95 backdrop-blur-xl',
          'transition-opacity duration-300',
          isClosing ? 'opacity-0' : 'opacity-100'
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Close button */}
      <button
        onClick={handleClose}
        className={cn(
          'absolute top-4 right-4 z-10',
          'w-12 h-12 rounded-full',
          'flex items-center justify-center',
          'bg-white/10 text-white/80',
          'hover:bg-white/20 hover:text-white',
          'backdrop-blur-md',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-white/50'
        )}
        aria-label="关闭"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation buttons */}
      {hasPrev && onPrev && (
        <button
          onClick={onPrev}
          className={cn(
            'absolute left-4 top-1/2 -translate-y-1/2 z-10',
            'w-12 h-12 rounded-full',
            'flex items-center justify-center',
            'bg-white/10 text-white/80',
            'hover:bg-white/20 hover:text-white',
            'backdrop-blur-md',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-white/50'
          )}
          aria-label="上一张"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {hasNext && onNext && (
        <button
          onClick={onNext}
          className={cn(
            'absolute right-4 top-1/2 -translate-y-1/2 z-10',
            'w-12 h-12 rounded-full',
            'flex items-center justify-center',
            'bg-white/10 text-white/80',
            'hover:bg-white/20 hover:text-white',
            'backdrop-blur-md',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-white/50'
          )}
          aria-label="下一张"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Main content */}
      <div
        className={cn(
          'relative z-0 flex flex-col lg:flex-row',
          'w-full h-full lg:h-[90vh] lg:w-[90vw] lg:max-w-6xl',
          'p-4 lg:p-8 gap-4 lg:gap-6',
          'transition-all duration-300',
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        )}
      >
        {/* Image container */}
        <div className="flex-1 flex items-center justify-center min-h-0 relative">
          {isImageLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <img
            ref={imageRef}
            src={item.url}
            alt={item.title}
            className={cn(
              'max-w-full max-h-full object-contain rounded-lg',
              'shadow-2xl shadow-black/20',
              'transition-opacity duration-300',
              isImageLoading ? 'opacity-0' : 'opacity-100'
            )}
            onLoad={() => setIsImageLoading(false)}
          />
        </div>

        {/* Info panel */}
        <div className={cn(
          'lg:w-80 flex-shrink-0',
          'bg-white/10 backdrop-blur-xl rounded-2xl',
          'border border-white/10',
          'p-5 flex flex-col gap-4',
          'max-h-[40vh] lg:max-h-none overflow-y-auto'
        )}>
          {/* Title */}
          <div>
            <h2 className="text-xl font-semibold text-white leading-tight">
              {item.title}
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {formatDetailedTime(item.capturedAt)}
            </p>
          </div>

          {/* Meta info */}
          <div className="space-y-3">
            <div className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
              source.color.replace('bg-', 'bg-white/').replace('text-', 'text-')
            )}>
              <span>{source.icon}</span>
              <span>{source.label}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-white/50">文件名</div>
              <div className="text-white/90 truncate">{item.filename}</div>
              <div className="text-white/50">大小</div>
              <div className="text-white/90">{fileSize} KB</div>
              <div className="text-white/50">格式</div>
              <div className="text-white/90 uppercase">{item.mimeType.split('/')[1] || 'PNG'}</div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-auto pt-4 border-t border-white/10 space-y-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className={cn(
                'w-full py-2.5 px-4 rounded-xl',
                'flex items-center justify-center gap-2',
                'bg-rose-500/20 text-rose-300',
                'hover:bg-rose-500/30',
                'border border-rose-500/30',
                'transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-rose-500/50'
              )}
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm font-medium">删除</span>
            </button>

            <a
              href={item.url}
              download={item.filename}
              className={cn(
                'w-full py-2.5 px-4 rounded-xl',
                'flex items-center justify-center gap-2',
                'bg-white/10 text-white/80',
                'hover:bg-white/20',
                'border border-white/10',
                'transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-white/50'
              )}
            >
              <Download className="w-4 h-4" />
              <span className="text-sm font-medium">下载</span>
            </a>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-slate-900 rounded-2xl p-6 max-w-sm w-full border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-2">确认删除？</h3>
            <p className="text-white/60 text-sm mb-6">
              此操作不可撤销。图片将被永久删除。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

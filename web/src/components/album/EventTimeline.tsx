'use client';

import React from 'react';
import { 
  ImagePlus, 
  Trash2, 
  Shield, 
  ShieldOff,
  Camera,
  FolderOpen,
  RefreshCw
} from 'lucide-react';
import type { AlbumEvent, AlbumEventType } from '@/lib/album/types';
import { cn } from '@/lib/utils';

interface EventTimelineProps {
  events: AlbumEvent[];
  maxItems?: number;
}

function formatEventTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function getEventIcon(type: AlbumEventType): { icon: React.ReactNode; bgColor: string; textColor: string } {
  switch (type) {
    case 'screenshot_captured':
      return {
        icon: <Camera className="w-3.5 h-3.5" />,
        bgColor: 'bg-sky-100',
        textColor: 'text-sky-600',
      };
    case 'photo_imported':
      return {
        icon: <FolderOpen className="w-3.5 h-3.5" />,
        bgColor: 'bg-amber-100',
        textColor: 'text-amber-600',
      };
    case 'item_deleted':
      return {
        icon: <Trash2 className="w-3.5 h-3.5" />,
        bgColor: 'bg-rose-100',
        textColor: 'text-rose-600',
      };
    case 'privacy_changed':
      return {
        icon: <Shield className="w-3.5 h-3.5" />,
        bgColor: 'bg-emerald-100',
        textColor: 'text-emerald-600',
      };
    default:
      return {
        icon: <RefreshCw className="w-3.5 h-3.5" />,
        bgColor: 'bg-slate-100',
        textColor: 'text-slate-600',
      };
  }
}

function getEventLabel(type: AlbumEventType): string {
  switch (type) {
    case 'screenshot_captured':
      return '截图保存';
    case 'photo_imported':
      return '图片导入';
    case 'item_deleted':
      return '删除图片';
    case 'privacy_changed':
      return '隐私设置';
    default:
      return '系统事件';
  }
}

export function EventTimeline({ events, maxItems = 10 }: EventTimelineProps) {
  const displayEvents = events.slice(0, maxItems);
  const hasMore = events.length > maxItems;

  if (displayEvents.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">暂无事件记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {displayEvents.map((event, index) => {
        const { icon, bgColor, textColor } = getEventIcon(event.type);
        const isLast = index === displayEvents.length - 1;
        
        return (
          <div
            key={event.id}
            className={cn(
              'flex gap-3 py-3',
              !isLast && 'border-b border-slate-100'
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Icon */}
            <div className={cn(
              'w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center',
              bgColor,
              textColor
            )}>
              {icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-slate-700">
                  {getEventLabel(event.type)}
                </span>
                <span className="text-xs text-slate-400">
                  {formatEventTime(event.createdAt)}
                </span>
              </div>
              
              {event.note && (
                <p className="text-xs text-slate-500 truncate">
                  {event.note}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {hasMore && (
        <div className="pt-3 text-center">
          <span className="text-xs text-slate-400">
            还有 {events.length - maxItems} 条记录...
          </span>
        </div>
      )}
    </div>
  );
}

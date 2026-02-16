'use client';

import React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeGroupHeaderProps {
  date: Date;
  count: number;
  isFirst?: boolean;
}

function getRelativeTimeLabel(date: Date): string | undefined {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (dateStart.getTime() === today.getTime()) {
    return '今天';
  }
  if (dateStart.getTime() === yesterday.getTime()) {
    return '昨天';
  }
  
  const daysDiff = Math.floor((today.getTime() - dateStart.getTime()) / 86400000);
  if (daysDiff < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays[date.getDay()];
  }
  if (daysDiff < 30) {
    return `${daysDiff} 天前`;
  }
  
  return undefined;
}

function formatGroupDate(date: Date): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const dateYear = date.getFullYear();
  
  const options: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
  };
  
  if (dateYear !== currentYear) {
    options.year = 'numeric';
  }
  
  return date.toLocaleDateString('zh-CN', options);
}

export function TimeGroupHeader({ date, count, isFirst = false }: TimeGroupHeaderProps) {
  const relativeLabel = getRelativeTimeLabel(date);
  const formattedDate = formatGroupDate(date);

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-4 sticky top-0 z-10',
        'bg-gradient-to-r from-slate-50 via-slate-50 to-transparent',
        isFirst ? 'pt-2' : 'pt-6'
      )}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-sky-600" />
        </div>
        <div className="flex items-baseline gap-2">
          {relativeLabel && (
            <span className="text-lg font-semibold text-slate-800">{relativeLabel}</span>
          )}
          <span className={cn(
            'text-sm',
            relativeLabel ? 'text-slate-500 font-normal' : 'text-slate-800 font-semibold'
          )}>
            {formattedDate}
          </span>
        </div>
      </div>
      
      <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
      
      <span className="text-xs text-slate-400 font-medium">
        {count} 项
      </span>
    </div>
  );
}

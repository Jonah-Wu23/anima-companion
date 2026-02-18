'use client';

import React from 'react';
import { Filter, UserRound, Box, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterType = 'all' | 'current-character' | 'unassigned';

interface FilterBarProps {
  currentFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  totalCount: number;
  filteredCount: number;
}

const filterOptions: { value: FilterType; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: '全部', icon: <Filter className="w-3.5 h-3.5" /> },
  { value: 'current-character', label: '当前角色', icon: <UserRound className="w-3.5 h-3.5" /> },
  { value: 'unassigned', label: '未归属', icon: <Box className="w-3.5 h-3.5" /> },
];

export function FilterBar({ currentFilter, onFilterChange, totalCount, filteredCount }: FilterBarProps) {
  const isFiltered = currentFilter !== 'all';

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onFilterChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
              'transition-all duration-200',
              currentFilter === option.value
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            )}
            aria-pressed={currentFilter === option.value}
          >
            {option.icon}
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        ))}
      </div>

      {isFiltered && (
        <button
          onClick={() => onFilterChange('all')}
          className={cn(
            'flex items-center gap-1 px-2 py-1.5 rounded-lg',
            'text-xs text-slate-500 hover:text-slate-700',
            'hover:bg-slate-100 transition-colors'
          )}
          aria-label="清除筛选"
        >
          <X className="w-3.5 h-3.5" />
          <span>清除</span>
        </button>
      )}

      <div className="ml-auto text-xs text-slate-400">
        {isFiltered ? (
          <span>
            显示 <span className="font-medium text-slate-600">{filteredCount}</span> / {totalCount}
          </span>
        ) : (
          <span>共 <span className="font-medium text-slate-600">{totalCount}</span> 项</span>
        )}
      </div>
    </div>
  );
}

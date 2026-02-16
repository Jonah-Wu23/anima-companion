import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingOverlayProps {
  isVisible: boolean;
  progress: number;
  message?: string;
}

export function LoadingOverlay({ 
  isVisible, 
  progress, 
  message = '加载中...' 
}: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className={cn(
        'relative px-8 py-10 rounded-2xl',
        'bg-white/90 backdrop-blur-xl',
        'border border-white/60',
        'shadow-2xl shadow-slate-900/20',
        'flex flex-col items-center gap-6',
        'animate-fadeInUp'
      )}>
        {/* Animated Icon */}
        <div className="relative">
          <div className={cn(
            'w-16 h-16 rounded-full',
            'bg-gradient-to-br from-sky-400 to-cyan-500',
            'flex items-center justify-center',
            'shadow-lg shadow-sky-500/30'
          )}>
            <Sparkles className="w-8 h-8 text-white animate-pulse" />
          </div>
          
          {/* Orbiting dots */}
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-sky-400 rounded-full" />
          </div>
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }}>
            <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full" />
          </div>
        </div>
        
        {/* Text */}
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-slate-800">
            {message}
          </h3>
          <p className="text-sm text-slate-500">
            请稍候，正在准备新装扮
          </p>
        </div>
        
        {/* Progress Bar */}
        <div className="w-64 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>进度</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className={cn(
                'h-full rounded-full transition-all duration-300',
                'bg-gradient-to-r from-sky-400 to-cyan-500'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        
        {/* Decorative Elements */}
        <div className="absolute -top-2 -left-2 w-4 h-4 bg-sky-400/30 rounded-full blur-sm" />
        <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-cyan-400/30 rounded-full blur-sm" />
      </div>
    </div>
  );
}

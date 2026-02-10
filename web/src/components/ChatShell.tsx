import React from 'react';
import { cn } from '@/lib/utils';

export function ChatShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div 
      className={cn(
        "relative flex flex-col w-full h-[100dvh] overflow-hidden bg-gray-50 text-slate-900",
        className
      )}
    >
      {children}
    </div>
  );
}

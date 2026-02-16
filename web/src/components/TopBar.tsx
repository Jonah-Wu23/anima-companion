import React from 'react';
import { Camera, Images, Settings, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage, AvatarStatus } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface TopBarProps {
  onOpenSettings: () => void;
  onOpenAlbum?: () => void;
  onCaptureMoment?: () => void;
  captureDisabled?: boolean;
  className?: string;
  status?: string;
}

export function TopBar({
  onOpenSettings,
  onOpenAlbum,
  onCaptureMoment,
  captureDisabled = false,
  className,
  status = "陪伴中",
}: TopBarProps) {
  return (
    <header
      className={cn(
        "h-14 lg:h-16 w-full flex items-center justify-between px-4 z-50 shrink-0",
        // Glassmorphism
        "bg-white/60 backdrop-blur-md border-b border-white/20 shadow-sm transition-all",
        className
      )}
    >
      {/* Left: Avatar + Info */}
      <div className="flex items-center gap-3">
        <div className="relative">
            <Avatar className="h-9 w-9 lg:h-10 lg:w-10 ring-2 ring-white/50 shadow-sm transition-transform hover:scale-105">
            <AvatarImage src="/assets/phainon-profile.jpg" alt="白厄" />
            <AvatarFallback className="bg-gradient-to-br from-sky-400 to-blue-500 text-white text-xs font-medium">
              白
            </AvatarFallback>
          </Avatar>
          <AvatarStatus status="online" className="ring-2 ring-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-display font-bold text-slate-800 text-sm lg:text-base leading-tight">
            白厄
          </span>
          <span className="text-[10px] lg:text-xs text-slate-500 font-medium leading-tight flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400"></span>
            </span>
            {status}
          </span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {onCaptureMoment && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCaptureMoment}
            disabled={captureDisabled}
            className="rounded-full hover:bg-white/50 text-slate-600 hover:text-sky-600 transition-colors disabled:opacity-50"
            aria-label="截图并保存到回忆相册"
          >
            <Camera className="w-5 h-5" />
          </Button>
        )}
        <Link href="/wardrobe">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-white/50 text-slate-600 hover:text-sky-600 transition-colors"
            aria-label="换装间"
          >
            <Sparkles className="w-5 h-5" />
          </Button>
        </Link>
        {onOpenAlbum && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenAlbum}
            className="rounded-full hover:bg-white/50 text-slate-600 hover:text-sky-600 transition-colors"
            aria-label="打开回忆相册"
          >
            <Images className="w-5 h-5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          className="rounded-full hover:bg-white/50 text-slate-600 hover:text-sky-600 transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}

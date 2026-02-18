'use client';

import React from 'react';
import { Camera, Images, Settings, Sparkles, Home } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage, AvatarStatus } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { CharacterSwitcher } from '@/components/CharacterSwitcher';
import { getCharacterById } from '@/lib/characters/registry';
import { useCharacterStore } from '@/lib/store/characterStore';
import { cn } from '@/lib/utils';

interface TopBarProps {
  onOpenSettings: () => void;
  onOpenAlbum?: () => void;
  onCaptureMoment?: () => void;
  captureDisabled?: boolean;
  className?: string;
  status?: string;
}

function ActionHint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      {children}
      <span
        className={cn(
          'pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2',
          'hidden whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-medium text-white shadow-lg',
          'opacity-0 transition-opacity duration-150 md:block',
          'group-hover:opacity-100 group-focus-within:opacity-100'
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function TopBar({
  onOpenSettings,
  onOpenAlbum,
  onCaptureMoment,
  captureDisabled = false,
  className,
  status = "陪伴中",
}: TopBarProps) {
  const currentCharacterId = useCharacterStore((state) => state.currentCharacterId);
  const currentCharacter = getCharacterById(currentCharacterId);

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
            <AvatarImage src={currentCharacter.profileImage} alt={currentCharacter.name} />
            <AvatarFallback className="bg-gradient-to-br from-sky-400 to-blue-500 text-white text-xs font-medium">
              {currentCharacter.fallbackShortName}
            </AvatarFallback>
          </Avatar>
          <AvatarStatus status="online" className="ring-2 ring-white" />
        </div>
        <div className="flex flex-col justify-center">
          <span className="font-display font-bold text-slate-800 text-base lg:text-base leading-tight">
            {currentCharacter.name}
          </span>
          <span className="hidden lg:flex text-xs text-slate-500 font-medium leading-tight items-center gap-1.5">
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
        <CharacterSwitcher compact showLabel={false} className="mr-1 bg-white/80 border-white/80" />

        {/* 返回主页 */}
        <ActionHint label="返回主页">
          <Link href="/">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-amber-100/50 text-slate-600 hover:text-amber-600 transition-colors"
              aria-label="返回主页"
              title="返回主页"
            >
              <Home className="w-5 h-5" />
            </Button>
          </Link>
        </ActionHint>
        
        {onCaptureMoment && (
          <ActionHint label="截图并保存当前画面">
            <Button
              variant="ghost"
              size="icon"
              onClick={onCaptureMoment}
              disabled={captureDisabled}
              className="rounded-full hover:bg-white/50 text-slate-600 hover:text-sky-600 transition-colors disabled:opacity-50"
              aria-label="截图并保存到回忆相册"
              title="截图并保存当前画面"
            >
              <Camera className="w-5 h-5" />
            </Button>
          </ActionHint>
        )}
        <ActionHint label="进入换装间">
          <Link href="/wardrobe">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-white/50 text-slate-600 hover:text-sky-600 transition-colors"
              aria-label="换装间"
              title="进入换装间"
            >
              <Sparkles className="w-5 h-5" />
            </Button>
          </Link>
        </ActionHint>
        {onOpenAlbum && (
          <ActionHint label="打开回忆相册">
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenAlbum}
              className="rounded-full hover:bg-white/50 text-slate-600 hover:text-sky-600 transition-colors"
              aria-label="打开回忆相册"
              title="打开回忆相册"
            >
              <Images className="w-5 h-5" />
            </Button>
          </ActionHint>
        )}
        <ActionHint label="打开设置">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            className="hidden lg:flex rounded-full hover:bg-white/50 text-slate-600 hover:text-sky-600 transition-colors"
            aria-label="打开设置"
            title="打开设置"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </ActionHint>
      </div>
    </header>
  );
}

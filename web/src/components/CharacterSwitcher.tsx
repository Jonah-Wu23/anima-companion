'use client';

import { useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import { AVAILABLE_CHARACTERS, getCharacterById } from '@/lib/characters/registry';
import type { CharacterId } from '@/lib/characters/types';
import { useCharacterStore } from '@/lib/store/characterStore';
import { cn } from '@/lib/utils';

interface CharacterSwitcherProps {
  className?: string;
  compact?: boolean;
  showLabel?: boolean;
}

export function CharacterSwitcher({
  className,
  compact = false,
  showLabel = true,
}: CharacterSwitcherProps) {
  const currentCharacterId = useCharacterStore((state) => state.currentCharacterId);
  const setCurrentCharacter = useCharacterStore((state) => state.setCurrentCharacter);
  const syncCurrentCharacterModel = useCharacterStore((state) => state.syncCurrentCharacterModel);

  useEffect(() => {
    syncCurrentCharacterModel();
  }, [currentCharacterId, syncCurrentCharacterModel]);

  const currentCharacter = useMemo(
    () => getCharacterById(currentCharacterId),
    [currentCharacterId],
  );

  return (
    <div
      className={cn(
        'relative inline-flex items-center gap-2 rounded-xl border border-white/60 bg-white/70 backdrop-blur-sm shadow-sm',
        compact ? 'px-2 py-1' : 'px-3 py-2',
        className,
      )}
    >
      <Avatar className={compact ? 'h-6 w-6 ring-1 ring-white/80' : 'h-8 w-8 ring-2 ring-white/80'}>
        <AvatarImage src={currentCharacter.profileImage} alt={currentCharacter.name} />
        <AvatarFallback className="bg-gradient-to-br from-sky-400 to-blue-500 text-white text-[10px] font-medium">
          {currentCharacter.fallbackShortName}
        </AvatarFallback>
      </Avatar>

      <div className="relative min-w-[80px] lg:min-w-[120px]">
        {showLabel && !compact && (
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            当前角色
          </span>
        )}
        <select
          value={currentCharacterId}
          onChange={(event) => setCurrentCharacter(event.target.value as CharacterId)}
          className={cn(
            'w-full appearance-none bg-transparent pr-5 text-sm font-medium text-slate-700 outline-none',
            compact ? 'h-5 text-xs' : 'h-6',
          )}
          aria-label="选择当前角色"
        >
          {AVAILABLE_CHARACTERS.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChatShell } from '@/components/ChatShell';
import { MessagePanel } from '@/components/MessagePanel';
import { InputDock } from '@/components/InputDock';
import { SettingsSheet } from '@/components/SettingsSheet';

const Viewport3D = dynamic(
  () => import('@/components/Viewport3D').then((mod) => mod.Viewport3D),
  {
    ssr: false,
    loading: () => <div className="w-full h-full" />,
  },
);

export default function Home() {
  // Hydration check to prevent server/client mismatch with persisted store
  const [mounted, setMounted] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <ChatShell>
      {/* 3D Viewport (Top/Background) */}
      <div className="absolute top-0 left-0 w-full h-[40vh] bg-gradient-to-b from-blue-50 to-transparent z-0">
        <Viewport3D />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col h-full z-10 relative pointer-events-none">
        {/* Header / TopBar */}
        <div className="h-14 w-full flex items-center justify-between px-4 bg-white/80 backdrop-blur-sm border-b border-gray-100 shrink-0 pointer-events-auto">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-semibold text-sm text-slate-700">白厄 (Bai E)</span>
          </div>
          <div className="text-xs text-gray-400">v0.1.0</div>
        </div>

        {/* Scrollable Message Panel */}
        <div className="flex-1 min-h-0 pointer-events-auto">
            <MessagePanel />
        </div>

        {/* Fixed Input Dock */}
        <div className="pointer-events-auto">
            <InputDock onOpenSettings={() => setIsSettingsOpen(true)} />
        </div>
      </div>

      {/* Settings Sheet Overlay */}
      <SettingsSheet 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </ChatShell>
  );
}

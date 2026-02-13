"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MessagePanel } from '@/components/MessagePanel';
import { InputDock } from '@/components/InputDock';
import { SettingsSheet } from '@/components/SettingsSheet';
import { TopBar } from '@/components/TopBar';
import { useAvatarStore } from '@/lib/store/avatarStore';
import { LoadingScreen } from '@/components/LoadingScreen';

const Viewport3D = dynamic(
  () => import('@/components/Viewport3D').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="w-full h-full bg-sky-50/20 animate-pulse" />,
  },
);

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { sceneStatus } = useAvatarStore();
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const isLoading = !mounted || sceneStatus === 'loading';

  return (
    <main className="relative flex flex-col lg:flex-row w-full h-[100dvh] overflow-hidden bg-gradient-to-br from-sky-50 via-white to-blue-50 text-slate-800">
      <LoadingScreen isLoading={isLoading} />
      
      {mounted && (
        <>
          {/* Mobile TopBar (Fixed Overlay) */}
          <TopBar 
            className="lg:hidden fixed top-0 left-0 w-full z-50" 
            onOpenSettings={() => setIsSettingsOpen(true)}
          />

          {/* Left Column (Desktop) / Top Section (Mobile) - Viewport 3D */}
          <section className="relative w-full h-[40vh] lg:w-[40%] lg:h-full shrink-0 z-0">
            <Viewport3D />
            
            {/* Mobile Gradient Overlay for better text contrast if needed */}
            <div className="lg:hidden absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />
          </section>

          {/* Right Column (Desktop) / Bottom Section (Mobile) - Chat Interface */}
          <section className="flex-1 w-full lg:w-[60%] lg:h-full flex flex-col relative z-10 bg-white/40 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none border-t border-white/20 lg:border-t-0 lg:border-l lg:border-white/30 shadow-2xl lg:shadow-none rounded-t-3xl lg:rounded-none -mt-6 lg:mt-0 pt-2 lg:pt-0 overflow-hidden">
            
            {/* Desktop TopBar */}
            <TopBar 
              className="hidden lg:flex" 
              onOpenSettings={() => setIsSettingsOpen(true)}
            />

            {/* Message Panel (Scrollable) */}
            <div className="flex-1 min-h-0 w-full relative">
              <MessagePanel />
            </div>

            {/* Input Dock */}
            <div className="shrink-0 w-full z-50 bg-white/80 backdrop-blur-md lg:bg-white lg:backdrop-blur-none border-t border-white/20 lg:border-gray-100">
              <InputDock onOpenSettings={() => setIsSettingsOpen(true)} />
            </div>

          </section>

          {/* Settings Sheet */}
          <SettingsSheet 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
          />
        </>
      )}
    </main>
  );
}

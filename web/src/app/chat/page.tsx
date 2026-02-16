"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { MessagePanel } from '@/components/MessagePanel';
import { VoiceInputDock } from '@/components/VoiceInputDock';
import { SettingsSheet } from '@/components/SettingsSheet';
import { TopBar } from '@/components/TopBar';
import { AlbumCapturePromptModal } from '@/components/AlbumCapturePromptModal';
import { useAvatarStore } from '@/lib/store/avatarStore';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TouchInteractionProvider } from '@/lib/interaction/TouchInteractionProvider';
import { albumApi } from '@/lib/album/client';

const Viewport3D = dynamic(
  () => import('@/components/Viewport3D').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="w-full h-full bg-sky-50/20 animate-pulse" />,
  },
);

const MOBILE_VIEWPORT_DEFAULT_RATIO = 0.4;
const MOBILE_VIEWPORT_MIN_RATIO = 0.28;
const MOBILE_VIEWPORT_MAX_RATIO = 0.72;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(true);
  const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);
  const [isResizingViewport, setIsResizingViewport] = useState(false);
  const [isCapturePromptOpen, setIsCapturePromptOpen] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { sceneStatus } = useAvatarStore();
  const mainRef = useRef<HTMLElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMobileViewportHeight = useCallback((clientY: number) => {
    if (typeof window === 'undefined') {
      return;
    }

    const containerTop = mainRef.current?.getBoundingClientRect().top ?? 0;
    const viewportHeight = window.innerHeight;
    const minHeight = viewportHeight * MOBILE_VIEWPORT_MIN_RATIO;
    const maxHeight = viewportHeight * MOBILE_VIEWPORT_MAX_RATIO;
    const nextHeight = clamp(clientY - containerTop, minHeight, maxHeight);
    setMobileViewportHeight(nextHeight);
  }, []);

  const stopResizeViewport = useCallback(() => {
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = null;
    setIsResizingViewport(false);
  }, []);

  const handleViewportResizeStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (isDesktopLayout || typeof window === 'undefined') {
        return;
      }

      event.preventDefault();
      stopResizeViewport();
      setIsResizingViewport(true);
      updateMobileViewportHeight(event.clientY);

      const onPointerMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        updateMobileViewportHeight(moveEvent.clientY);
      };

      const onPointerEnd = () => {
        stopResizeViewport();
      };

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerEnd);
      window.addEventListener('pointercancel', onPointerEnd);

      resizeCleanupRef.current = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerEnd);
        window.removeEventListener('pointercancel', onPointerEnd);
      };
    },
    [isDesktopLayout, stopResizeViewport, updateMobileViewportHeight]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncLayout = () => {
      const viewportHeight = window.innerHeight;
      const isDesktop = window.innerWidth >= 1024;
      const minHeight = viewportHeight * MOBILE_VIEWPORT_MIN_RATIO;
      const maxHeight = viewportHeight * MOBILE_VIEWPORT_MAX_RATIO;
      setIsDesktopLayout(isDesktop);
      setMobileViewportHeight((prev) => {
        const fallbackHeight = viewportHeight * MOBILE_VIEWPORT_DEFAULT_RATIO;
        return clamp(prev ?? fallbackHeight, minHeight, maxHeight);
      });
    };

    syncLayout();
    window.addEventListener('resize', syncLayout);
    window.addEventListener('orientationchange', syncLayout);

    return () => {
      window.removeEventListener('resize', syncLayout);
      window.removeEventListener('orientationchange', syncLayout);
    };
  }, []);

  useEffect(() => () => {
    stopResizeViewport();
  }, [stopResizeViewport]);

  const showCaptureFeedback = useCallback((type: 'success' | 'error', message: string) => {
    setCaptureFeedback({ type, message });
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    feedbackTimerRef.current = setTimeout(() => {
      setCaptureFeedback(null);
      feedbackTimerRef.current = null;
    }, 2600);
  }, []);

  useEffect(() => () => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  const openAlbumPage = useCallback(() => {
    router.push('/album');
  }, [router]);

  const captureCanvasFrame = useCallback(async (): Promise<{ blob: Blob; width: number; height: number }> => {
    const canvas = document.querySelector('main canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('当前页面未检测到可截图的画布');
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('截图失败，请稍后重试'));
            return;
          }
          resolve(result);
        },
        'image/png',
        0.92,
      );
    });

    return {
      blob,
      width: canvas.width,
      height: canvas.height,
    };
  }, []);

  const handleCaptureMoment = useCallback(async () => {
    if (isCapturing) {
      return;
    }

    setIsCapturing(true);
    try {
      const { blob, width, height } = await captureCanvasFrame();
      const title = `对白瞬间 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
      await albumApi.captureScreenshot(blob, {
        title,
        width,
        height,
      });
      setCaptureTitle(title);
      setIsCapturePromptOpen(true);
      showCaptureFeedback('success', '截图已写入回忆相册');
    } catch (error) {
      const message = error instanceof Error ? error.message : '截图失败';
      showCaptureFeedback('error', message);
    } finally {
      setIsCapturing(false);
    }
  }, [captureCanvasFrame, isCapturing, showCaptureFeedback]);

  const isLoading = !mounted || sceneStatus === 'loading';
  const mobileViewportStyle =
    !isDesktopLayout && mobileViewportHeight !== null
      ? { height: `${mobileViewportHeight}px` }
      : undefined;

  return (
    <main
      ref={mainRef}
      className="relative flex flex-col lg:flex-row w-full h-[100dvh] overflow-hidden bg-gradient-to-br from-sky-50 via-white to-blue-50 text-slate-800"
    >
      <LoadingScreen isLoading={isLoading} />
      {captureFeedback && (
        <div
          className={`pointer-events-none fixed left-1/2 top-16 z-[75] -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-md ${
            captureFeedback.type === 'success'
              ? 'bg-emerald-500/90 text-white'
              : 'bg-rose-500/90 text-white'
          }`}
        >
          {captureFeedback.message}
        </div>
      )}
      
      {mounted && (
        <TouchInteractionProvider>
          {/* Mobile TopBar (Fixed Overlay) */}
          <TopBar 
            className="lg:hidden fixed top-0 left-0 w-full z-50" 
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenAlbum={openAlbumPage}
            onCaptureMoment={() => void handleCaptureMoment()}
            captureDisabled={isLoading || isCapturing}
          />

          {/* Left Column (Desktop) / Top Section (Mobile) - Viewport 3D */}
          <section
            className="relative w-full h-[40vh] lg:w-[40%] lg:h-full shrink-0 z-0"
            style={mobileViewportStyle}
          >
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
              onOpenAlbum={openAlbumPage}
              onCaptureMoment={() => void handleCaptureMoment()}
              captureDisabled={isLoading || isCapturing}
            />

            {/* Mobile viewport resize handle */}
            {!isDesktopLayout && (
              <div className="shrink-0 px-4 pt-1 pb-1 lg:hidden">
                <button
                  type="button"
                  aria-label="调整3D区域高度"
                  onPointerDown={handleViewportResizeStart}
                  className="mx-auto flex h-6 w-16 touch-none items-center justify-center"
                >
                  <span
                    className={`h-1.5 w-12 rounded-full transition-colors ${
                      isResizingViewport ? 'bg-sky-400' : 'bg-slate-300/80'
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Message Panel (Scrollable) */}
            <div className="flex-1 min-h-0 w-full relative">
              <MessagePanel />
            </div>

            {/* Voice Input Dock */}
            <div className="shrink-0 w-full z-50 bg-white/80 backdrop-blur-md lg:bg-white lg:backdrop-blur-none border-t border-white/20 lg:border-gray-100">
              <VoiceInputDock onOpenSettings={() => setIsSettingsOpen(true)} />
            </div>

          </section>

          {/* Settings Sheet */}
          <SettingsSheet 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
          />

          <AlbumCapturePromptModal
            isOpen={isCapturePromptOpen}
            title={captureTitle}
            onStay={() => setIsCapturePromptOpen(false)}
            onGoAlbum={() => {
              setIsCapturePromptOpen(false);
              openAlbumPage();
            }}
          />
        </TouchInteractionProvider>
      )}
    </main>
  );
}

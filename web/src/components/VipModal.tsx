'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Sparkles, Mic, MessageSquare, Volume2, X } from 'lucide-react';

interface VipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivate: () => void;
}

export function VipModal({ isOpen, onClose, onActivate }: VipModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-md items-start justify-center overflow-y-auto overscroll-contain px-1 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] sm:items-center">
        <div className="relative w-full max-h-[92vh] max-h-[92dvh] transform overflow-hidden rounded-3xl border border-white/60 bg-white/85 shadow-2xl backdrop-blur-2xl transition-all animate-fade-in">
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-amber-100/80 via-amber-50/40 to-transparent" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 rounded-full p-2 text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-600"
            aria-label="关闭 VIP 弹窗"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative max-h-[92vh] max-h-[92dvh] overflow-y-auto overscroll-contain px-8 pt-10 pb-6">
            <div className="mb-6 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 opacity-40 blur-xl animate-pulse" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 shadow-lg shadow-amber-500/30">
                  <Crown className="h-10 w-10 text-white drop-shadow-md" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Sparkles className="h-5 w-5 animate-pulse text-amber-400" />
                </div>
              </div>
            </div>

            <div className="mb-3 text-center">
              <h2 className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 bg-clip-text text-2xl font-bold text-transparent">
                开启 VIP 模式
              </h2>
            </div>

            <p className="mb-8 text-center text-sm leading-relaxed text-slate-500">
              VIP 功能免费开放，若愿意支持我们可先自愿打赏 6 元
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-4 rounded-2xl border border-amber-100/60 bg-gradient-to-r from-amber-50/80 to-white/60 p-4 backdrop-blur-sm">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-amber-300 text-amber-700 shadow-sm">
                  <Mic className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-700">语音输入</h3>
                  <p className="mt-0.5 text-xs text-slate-400">语音转文字，解放双手</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  VIP
                </span>
              </div>

              <div className="flex items-center gap-4 rounded-2xl border border-amber-100/60 bg-gradient-to-r from-amber-50/80 to-white/60 p-4 backdrop-blur-sm">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-amber-300 text-amber-700 shadow-sm">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-700">文字转语音回复</h3>
                  <p className="mt-0.5 text-xs text-slate-400">文字输入也能听到 TA 的声音</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  VIP
                </span>
              </div>

              <div className="flex items-center gap-4 rounded-2xl border border-amber-100/60 bg-gradient-to-r from-amber-50/80 to-white/60 p-4 backdrop-blur-sm">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-amber-300 text-amber-700 shadow-sm">
                  <Volume2 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-700">完整语音链路</h3>
                  <p className="mt-0.5 text-xs text-slate-400">端到端语音对话体验</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  VIP
                </span>
              </div>
            </div>

            <div className="sticky bottom-0 -mx-8 mt-6 border-t border-amber-100/70 bg-white/90 px-8 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-md">
              <div className="space-y-3">
                <button
                  onClick={onActivate}
                  className="group flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 font-semibold text-white shadow-lg shadow-amber-500/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-amber-500/40 active:scale-[0.98]"
                >
                  <Crown className="h-5 w-5 transition-transform group-hover:rotate-12" />
                  <span>去打赏页启用 VIP</span>
                </button>
                <button
                  onClick={onClose}
                  className="h-11 w-full rounded-full border border-slate-200 bg-white/60 text-sm font-medium text-slate-500 transition-all duration-300 hover:bg-white/80 hover:text-slate-700"
                >
                  稍后再说
                </button>
              </div>

              <p className="mt-4 text-center text-xs text-slate-400">打赏完全自愿，不影响 VIP 启用</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default VipModal;

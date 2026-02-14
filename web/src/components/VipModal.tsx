import React from 'react';
import { Crown, Sparkles, Mic, MessageSquare, Volume2, X } from 'lucide-react';

interface VipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivate: () => void;
}

export function VipModal({ isOpen, onClose, onActivate }: VipModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md transform transition-all animate-fade-in">
        <div className="relative overflow-hidden rounded-3xl bg-white/85 backdrop-blur-2xl shadow-2xl border border-white/60">
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-amber-100/80 via-amber-50/40 to-transparent" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-black/5 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="关闭 VIP 弹窗"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative px-8 pt-10 pb-8">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-300 to-amber-500 rounded-full blur-xl opacity-40 animate-pulse" />
                <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 shadow-lg shadow-amber-500/30">
                  <Crown className="w-10 h-10 text-white drop-shadow-md" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                </div>
              </div>
            </div>

            <div className="text-center mb-3">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 bg-clip-text text-transparent">
                开启 VIP 模式
              </h2>
            </div>

            <p className="text-center text-slate-500 text-sm mb-8 leading-relaxed">
              解锁完整语音交互体验，让对话更生动自然
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-50/80 to-white/60 border border-amber-100/60 backdrop-blur-sm">
                <div className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-amber-200 to-amber-300 text-amber-700 shadow-sm">
                  <Mic className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-700 text-sm">语音输入</h3>
                  <p className="text-xs text-slate-400 mt-0.5">语音转文字，解放双手</p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  VIP
                </span>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-50/80 to-white/60 border border-amber-100/60 backdrop-blur-sm">
                <div className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-amber-200 to-amber-300 text-amber-700 shadow-sm">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-700 text-sm">文字转语音回复</h3>
                  <p className="text-xs text-slate-400 mt-0.5">文字输入也能听到 TA 的声音</p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  VIP
                </span>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-50/80 to-white/60 border border-amber-100/60 backdrop-blur-sm">
                <div className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-amber-200 to-amber-300 text-amber-700 shadow-sm">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-700 text-sm">完整语音链路</h3>
                  <p className="text-xs text-slate-400 mt-0.5">端到端语音对话体验</p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  VIP
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={onActivate}
                className="w-full h-12 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-white font-semibold shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 group"
              >
                <Crown className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                <span>立即开启 VIP</span>
              </button>
              <button
                onClick={onClose}
                className="w-full h-11 rounded-full bg-white/60 text-slate-500 text-sm font-medium border border-slate-200 hover:bg-white/80 hover:text-slate-700 transition-all duration-300"
              >
                稍后再说
              </button>
            </div>

            <p className="text-center text-xs text-slate-400 mt-5">开启即表示同意 VIP 服务条款</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VipModal;

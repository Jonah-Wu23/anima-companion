import React from 'react';
import { Camera, Images, X } from 'lucide-react';

interface AlbumCapturePromptModalProps {
  isOpen: boolean;
  title?: string;
  onStay: () => void;
  onGoAlbum: () => void;
}

export function AlbumCapturePromptModal({
  isOpen,
  title,
  onStay,
  onGoAlbum,
}: AlbumCapturePromptModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onStay} />

      <div className="relative w-full max-w-md">
        <div className="relative overflow-hidden rounded-3xl bg-white/90 backdrop-blur-2xl shadow-2xl border border-white/70">
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-sky-100/90 via-white/10 to-transparent" />

          <button
            onClick={onStay}
            className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-black/5 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="关闭截图提示框"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative px-7 pt-9 pb-7">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-lg shadow-sky-500/35">
              <Camera className="w-8 h-8" />
            </div>

            <h2 className="text-center text-xl font-semibold text-slate-800">截图已加入回忆相册</h2>
            <p className="mt-2 text-center text-sm text-slate-500 leading-relaxed">
              {title ? `《${title}》已保存。` : '本次截图已保存。'} 你可以现在前往相册查看，也可以继续留在当前对话页。
            </p>

            <div className="mt-7 space-y-3">
              <button
                onClick={onGoAlbum}
                className="w-full h-11 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-semibold shadow-lg shadow-sky-500/35 hover:shadow-xl hover:shadow-sky-500/45 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <Images className="w-4 h-4" />
                前往回忆相册
              </button>
              <button
                onClick={onStay}
                className="w-full h-11 rounded-full border border-slate-200 bg-white/70 text-slate-600 text-sm font-medium hover:bg-white transition-colors"
              >
                留在当前页面
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

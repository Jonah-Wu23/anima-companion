"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { renderMarkdown } from "@/lib/legal/markdown-renderer";

interface LegalDocumentModalProps {
  open: boolean;
  title: string;
  markdown: string;
  loading: boolean;
  error: string;
  onClose: () => void;
}

export function LegalDocumentModal({
  open,
  title,
  markdown,
  loading,
  error,
  onClose,
}: LegalDocumentModalProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="关闭弹窗"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-[101] flex w-full max-w-3xl max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-[#1E293B]">{title}</h2>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-slate-500">文档加载中...</p>}

          {!loading && error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}

          {!loading && !error && markdown && (
            <article className="space-y-4 text-sm leading-7 text-slate-700 [&_a]:text-[#2563EB] [&_a]:underline [&_a]:underline-offset-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-[#1E293B] [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#1E293B] [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-[#1E293B] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-slate-200 [&_ol]:space-y-1 [&_ol]:pl-2 [&_ol>li]:ml-5 [&_ol>li]:list-decimal [&_p]:text-slate-700 [&_ul]:space-y-1 [&_ul]:pl-2 [&_ul>li]:ml-5 [&_ul>li]:list-disc">
              {renderMarkdown(markdown)}
            </article>
          )}
        </div>

        <footer className="border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-[#2563EB] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
          >
            确定
          </button>
        </footer>
      </section>
    </div>
  );
}

"use client";

import React from 'react';

export interface ModelLoadingIndicatorProps {
  progress: number;
  statusText?: string;
  className?: string;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function ModelLoadingIndicator({ progress, statusText, className }: ModelLoadingIndicatorProps) {
  const safeProgress = clampProgress(progress);
  const safeStatus = statusText?.trim() || (safeProgress >= 100 ? '模型准备完成' : '模型加载中...');

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      style={{
        width: '100%',
        maxWidth: 320,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(15, 23, 42, 0.08)',
        border: '1px solid rgba(15, 23, 42, 0.12)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.2 }}>{safeStatus}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', minWidth: 44, textAlign: 'right' }}>
          {safeProgress}%
        </span>
      </div>

      <div
        aria-hidden
        style={{
          width: '100%',
          height: 8,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'rgba(148, 163, 184, 0.28)',
        }}
      >
        <div
          style={{
            width: `${safeProgress}%`,
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, #0ea5e9 0%, #0284c7 100%)',
            transition: 'width 200ms ease-out',
          }}
        />
      </div>
    </div>
  );
}

export default ModelLoadingIndicator;

"use client";

import React, { useEffect, useState } from 'react';

interface LoadingScreenProps {
  isLoading: boolean;
}

const LOADING_TEXTS = [
  "正在唤醒...",
  "整理记忆碎片...",
  "调整光照参数...",
  "连接神经网络...",
  "准备见面礼...",
  "深呼吸...",
  "加载人格模块...",
  "初始化世界...",
  "校准情绪引擎...",
];

export function LoadingScreen({ isLoading }: LoadingScreenProps) {
  const [shouldRender, setShouldRender] = useState(true); // Start true to show initially if isLoading is true
  const [text, setText] = useState("Loading...");

  useEffect(() => {
    // Set initial text only on client side to avoid hydration mismatch
    setText(LOADING_TEXTS[Math.floor(Math.random() * LOADING_TEXTS.length)]);
  }, []);

  useEffect(() => {
    if (isLoading) {
      setShouldRender(true);
    } else {
      // Delay unmount for fade-out animation
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 1000); // Match transition duration
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center 
        bg-gradient-to-b from-primary-300 via-primary-100 to-accent
        transition-opacity duration-1000 ease-in-out
        ${isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      aria-hidden={!isLoading}
    >
      {/* Sun Container */}
      <div className="relative mb-8 flex items-center justify-center">
        {/* Outer Glow */}
        <div className="absolute w-64 h-64 bg-secondary-300/20 rounded-full blur-3xl animate-pulse-slow" />
        
        {/* Inner Glow */}
        <div className="absolute w-40 h-40 bg-secondary-400/30 rounded-full blur-2xl animate-pulse" />
        
        {/* Sun Core */}
        <div className="relative w-20 h-20 bg-gradient-to-br from-secondary-300 to-secondary-500 rounded-full shadow-[0_0_50px_rgba(251,191,36,0.5)] animate-pulse-slow">
           <div className="absolute inset-0 bg-white/20 rounded-full blur-sm" />
        </div>
      </div>

      {/* Loading Text */}
      <p className="text-primary-900/80 text-lg font-medium tracking-widest animate-pulse">
        {text}
      </p>
    </div>
  );
}

'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface Ripple {
  id: number;
  x: number;
  y: number;
  color: string;
}

interface TouchFeedbackState {
  ripples: Ripple[];
  scale: number;
  highlight: boolean;
  glowColor: string | null;
}

interface TouchFeedbackOptions {
  enableRipple?: boolean;
  enableScale?: boolean;
  enableHighlight?: boolean;
  rippleColor?: string;
  highlightColor?: string;
  scaleFactor?: number;
}

// ============================================================================
// Ripple Component
// ============================================================================

interface RippleEffectProps {
  ripples: Ripple[];
  onComplete: (id: number) => void;
}

function RippleEffect({ ripples, onComplete }: RippleEffectProps) {
  return (
    <>
      {ripples.map((ripple) => (
        <RippleItem
          key={ripple.id}
          ripple={ripple}
          onComplete={() => onComplete(ripple.id)}
        />
      ))}
    </>
  );
}

interface RippleItemProps {
  ripple: Ripple;
  onComplete: () => void;
}

function RippleItem({ ripple, onComplete }: RippleItemProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 600);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <span
      className="absolute rounded-full pointer-events-none animate-ripple"
      style={{
        left: ripple.x,
        top: ripple.y,
        transform: 'translate(-50%, -50%)',
        backgroundColor: ripple.color,
      }}
    />
  );
}

// ============================================================================
// TouchFeedback Component
// ============================================================================

interface TouchFeedbackProps {
  children: React.ReactNode;
  className?: string;
  options?: TouchFeedbackOptions;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  disabled?: boolean;
}

export function TouchFeedback({
  children,
  className,
  options = {},
  onClick,
  onMouseDown,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
  onTouchStart,
  onTouchEnd,
  disabled = false,
}: TouchFeedbackProps) {
  const {
    enableRipple = true,
    enableScale = true,
    enableHighlight = true,
    rippleColor = 'rgba(255, 255, 255, 0.3)',
    highlightColor = 'rgba(56, 189, 248, 0.3)',
    scaleFactor = 0.95,
  } = options;

  const [state, setState] = useState<TouchFeedbackState>({
    ripples: [],
    scale: 1,
    highlight: false,
    glowColor: null,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const rippleIdRef = useRef(0);

  const addRipple = useCallback((x: number, y: number) => {
    if (!enableRipple) return;
    
    const id = rippleIdRef.current++;
    setState(prev => ({
      ...prev,
      ripples: [...prev.ripples, { id, x, y, color: rippleColor }],
    }));
  }, [enableRipple, rippleColor]);

  const removeRipple = useCallback((id: number) => {
    setState(prev => ({
      ...prev,
      ripples: prev.ripples.filter(r => r.id !== id),
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      addRipple(e.clientX - rect.left, e.clientY - rect.top);
    }

    if (enableScale) {
      setState(prev => ({ ...prev, scale: scaleFactor }));
    }

    onMouseDown?.(e);
  }, [addRipple, enableScale, scaleFactor, onMouseDown, disabled]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (disabled) return;

    if (enableScale) {
      setState(prev => ({ ...prev, scale: 1 }));
    }

    onMouseUp?.(e);
  }, [enableScale, onMouseUp, disabled]);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (disabled) return;

    if (enableHighlight) {
      setState(prev => ({ 
        ...prev, 
        highlight: true,
        glowColor: highlightColor,
      }));
    }

    onMouseEnter?.(e);
  }, [enableHighlight, highlightColor, onMouseEnter, disabled]);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    if (disabled) return;

    if (enableScale) {
      setState(prev => ({ ...prev, scale: 1 }));
    }
    if (enableHighlight) {
      setState(prev => ({ 
        ...prev, 
        highlight: false,
        glowColor: null,
      }));
    }

    onMouseLeave?.(e);
  }, [enableScale, enableHighlight, onMouseLeave, disabled]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;

    const touch = e.touches[0];
    if (containerRef.current && touch) {
      const rect = containerRef.current.getBoundingClientRect();
      addRipple(touch.clientX - rect.left, touch.clientY - rect.top);
    }

    if (enableScale) {
      setState(prev => ({ ...prev, scale: scaleFactor }));
    }

    onTouchStart?.(e);
  }, [addRipple, enableScale, scaleFactor, onTouchStart, disabled]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (disabled) return;

    if (enableScale) {
      setState(prev => ({ ...prev, scale: 1 }));
    }

    onTouchEnd?.(e);
  }, [enableScale, onTouchEnd, disabled]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!disabled) {
      onClick?.(e);
    }
  }, [onClick, disabled]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden transition-all duration-200",
        className
      )}
      style={{
        transform: `scale(${state.scale})`,
        boxShadow: state.glowColor 
          ? `0 0 20px ${state.glowColor}, 0 0 40px ${state.glowColor}` 
          : undefined,
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {children}
      <RippleEffect ripples={state.ripples} onComplete={removeRipple} />
    </div>
  );
}

// ============================================================================
// TouchFeedbackOverlay Component
// ============================================================================

interface TouchFeedbackOverlayProps {
  children: React.ReactNode;
  className?: string;
}

export function TouchFeedbackOverlay({ children, className }: TouchFeedbackOverlayProps) {
  return (
    <div className={cn("relative", className)}>
      {children}
    </div>
  );
}

// ============================================================================
// HitZoneHighlighter Component
// ============================================================================

interface HitZoneHighlighterProps {
  zoneId: string;
  zoneName: string;
  isActive: boolean;
  isHovered: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function HitZoneHighlighter({
  zoneId,
  zoneName,
  isActive,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
  className,
  children,
}: HitZoneHighlighterProps) {
  return (
    <div
      className={cn(
        "absolute transition-all duration-300",
        isHovered && "ring-2 ring-sky-400/50 ring-offset-2 ring-offset-transparent",
        isActive && "ring-2 ring-sky-500 ring-offset-2 ring-offset-transparent",
        className
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-zone-id={zoneId}
      data-zone-name={zoneName}
    >
      {children}
      
      {/* Hover Label */}
      {isHovered && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900/80 text-white text-xs rounded whitespace-nowrap pointer-events-none animate-fade-in">
          {zoneName}
        </div>
      )}
      
      {/* Active Glow */}
      {isActive && (
        <div className="absolute inset-0 bg-sky-400/20 rounded-lg animate-pulse pointer-events-none" />
      )}
    </div>
  );
}

// ============================================================================
// GestureIndicator Component
// ============================================================================

interface GestureIndicatorProps {
  type: 'click' | 'doubleClick' | 'longPress' | 'drag' | 'hover';
  position: { x: number; y: number };
  visible: boolean;
}

export function GestureIndicator({ type, position, visible }: GestureIndicatorProps) {
  if (!visible) return null;

  const icons = {
    click: '👆',
    doubleClick: '👆👆',
    longPress: '✋',
    drag: '✋',
    hover: '👁️',
  };

  return (
    <div
      className="fixed pointer-events-none z-50 animate-fade-in"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="bg-slate-900/80 text-white text-lg px-3 py-2 rounded-full shadow-lg">
        {icons[type]}
      </div>
    </div>
  );
}

// ============================================================================
// CSS Animation Keyframes
// ============================================================================

export function TouchFeedbackStyles() {
  return (
    <style jsx global>{`
      @keyframes ripple {
        0% {
          width: 0;
          height: 0;
          opacity: 0.5;
        }
        100% {
          width: 200px;
          height: 200px;
          opacity: 0;
        }
      }
      
      .animate-ripple {
        animation: ripple 0.6s cubic-bezier(0, 0, 0.2, 1) forwards;
      }
      
      @keyframes pulse-glow {
        0%, 100% {
          box-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
        }
        50% {
          box-shadow: 0 0 40px rgba(56, 189, 248, 0.5);
        }
      }
      
      .animate-pulse-glow {
        animation: pulse-glow 2s ease-in-out infinite;
      }
    `}</style>
  );
}

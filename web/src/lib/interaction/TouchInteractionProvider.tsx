'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { usePipelineStore } from '@/lib/store/pipelineStore';

// ============================================================================
// Types
// ============================================================================

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface HitZone {
  id: string;
  name: string;
  bounds: {
    center: Vector3;
    size: Vector3;
  };
  priority: number;
  enabled: boolean;
  allowedInteractions: InteractionType[];
}

export type InteractionType = 'click' | 'doubleClick' | 'longPress' | 'drag' | 'hover';

export type EmotionType = 
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'embarrassed'
  | 'excited'
  | 'relaxed';

export interface Gesture {
  id: string;
  type: InteractionType;
  position: Vector2;
  startTime: number;
  duration: number;
  targetZone: HitZone | null;
}

export interface ClickGesture extends Gesture {
  type: 'click' | 'doubleClick' | 'longPress';
  pressure: number;
}

export interface DragGesture extends Gesture {
  type: 'drag';
  startPosition: Vector2;
  delta: Vector2;
  velocity: Vector2;
}

export interface HoverGesture extends Gesture {
  type: 'hover';
}

export interface ExpressionFeedback {
  emotion: EmotionType;
  intensity: number;
  duration: number;
  blendTime: number;
}

export interface MotionFeedback {
  motionType: string;
  targetBone: string;
  intensity: number;
  speed: number;
}

export interface VisualFeedback {
  type: 'ripple' | 'scale' | 'highlight' | 'glow';
  target: string;
  position?: Vector2;
  color?: string;
  duration: number;
}

export interface TouchInteractionState {
  activeGesture: Gesture | null;
  currentHitZone: HitZone | null;
  gestureHistory: Gesture[];
  cooldowns: Record<string, number>;
  currentExpression: ExpressionFeedback | null;
  isHovering: boolean;
  hoverPosition: Vector2 | null;
}

export interface TouchInteractionContextValue {
  // 注册/注销命中区域
  registerHitZone: (zone: HitZone) => void;
  unregisterHitZone: (zoneId: string) => void;
  getHitZone: (zoneId: string) => HitZone | undefined;
  getAllHitZones: () => HitZone[];
  
  // 触发反馈
  triggerExpression: (feedback: ExpressionFeedback) => void;
  triggerMotion: (feedback: MotionFeedback) => void;
  triggerVisualFeedback: (feedback: VisualFeedback) => void;
  
  // 手势处理
  handleClick: (position: Vector2, zoneId?: string) => void;
  handleDoubleClick: (position: Vector2, zoneId?: string) => void;
  handleLongPress: (position: Vector2, zoneId?: string) => void;
  handleDragStart: (position: Vector2, zoneId?: string) => void;
  handleDragMove: (position: Vector2, delta: Vector2) => void;
  handleDragEnd: () => void;
  handleHoverEnter: (position: Vector2, zoneId?: string) => void;
  handleHoverMove: (position: Vector2) => void;
  handleHoverLeave: () => void;
  
  // 状态查询
  state: TouchInteractionState;
  isInCooldown: (zoneId: string) => boolean;
  
  // 清除历史
  clearHistory: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DOUBLE_CLICK_THRESHOLD = 500; // ms
const DOUBLE_CLICK_MAX_DISTANCE = 0.08; // 归一化坐标
const SINGLE_CLICK_COMMIT_DELAY = 220; // ms
const LONG_PRESS_THRESHOLD = 500; // ms
const COOLDOWN_DURATION = 200; // ms
const HISTORY_LIMIT = 10;

const DEFAULT_EXPRESSION_DURATION = 1000;
const DEFAULT_BLEND_TIME = 300;

// ============================================================================
// Context
// ============================================================================

const TouchInteractionContext = createContext<TouchInteractionContextValue | null>(null);

export function useTouchInteraction() {
  const context = useContext(TouchInteractionContext);
  if (!context) {
    throw new Error('useTouchInteraction must be used within TouchInteractionProvider');
  }
  return context;
}

// ============================================================================
// Provider
// ============================================================================

interface TouchInteractionProviderProps {
  children: React.ReactNode;
}

export function TouchInteractionProvider({ children }: TouchInteractionProviderProps) {
  // Refs for mutable state
  const hitZonesRef = useRef<Map<string, HitZone>>(new Map());
  const gestureHistoryRef = useRef<Gesture[]>([]);
  const cooldownsRef = useRef<Record<string, number>>({});
  const activeGestureRef = useRef<Gesture | null>(null);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const expressionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastClickRef = useRef<{
    position: Vector2;
    zoneId: string | null;
    startTime: number;
  } | null>(null);
  
  // State for re-renders
  const [state, setState] = useState<TouchInteractionState>({
    activeGesture: null,
    currentHitZone: null,
    gestureHistory: [],
    cooldowns: {},
    currentExpression: null,
    isHovering: false,
    hoverPosition: null,
  });
  const setLipSyncEnergy = usePipelineStore((state) => state.setLipSyncEnergy);

  // ========================================================================
  // Hit Zone Management
  // ========================================================================

  const registerHitZone = useCallback((zone: HitZone) => {
    hitZonesRef.current.set(zone.id, zone);
  }, []);

  const unregisterHitZone = useCallback((zoneId: string) => {
    hitZonesRef.current.delete(zoneId);
  }, []);

  const getHitZone = useCallback((zoneId: string) => {
    return hitZonesRef.current.get(zoneId);
  }, []);

  const getAllHitZones = useCallback(() => {
    return Array.from(hitZonesRef.current.values()).sort((a, b) => b.priority - a.priority);
  }, []);

  // ========================================================================
  // Cooldown Management
  // ========================================================================

  const setCooldown = useCallback((zoneId: string) => {
    cooldownsRef.current[zoneId] = Date.now() + COOLDOWN_DURATION;
  }, []);

  const isInCooldown = useCallback((zoneId: string) => {
    const cooldownEnd = cooldownsRef.current[zoneId];
    if (!cooldownEnd) return false;
    if (Date.now() > cooldownEnd) {
      delete cooldownsRef.current[zoneId];
      return false;
    }
    return true;
  }, []);

  // ========================================================================
  // Gesture History
  // ========================================================================

  const addToHistory = useCallback((gesture: Gesture) => {
    gestureHistoryRef.current = [gesture, ...gestureHistoryRef.current].slice(0, HISTORY_LIMIT);
    setState(prev => ({ ...prev, gestureHistory: gestureHistoryRef.current }));
  }, []);

  const clearHistory = useCallback(() => {
    gestureHistoryRef.current = [];
    setState(prev => ({ ...prev, gestureHistory: [] }));
  }, []);

  // ========================================================================
  // Expression & Motion Feedback
  // ========================================================================

  const triggerExpression = useCallback((feedback: ExpressionFeedback) => {
    setState(prev => ({ ...prev, currentExpression: feedback }));

    // 恢复改动前同级别触摸口型反馈：点击表情期间注入临时 lip-sync 能量。
    const emotionEnergy: Record<EmotionType, number> = {
      neutral: 0.3,
      happy: 0.8,
      sad: 0.2,
      angry: 0.9,
      surprised: 0.9,
      embarrassed: 0.6,
      excited: 1.0,
      relaxed: 0.4,
    };
    setLipSyncEnergy(emotionEnergy[feedback.emotion] * feedback.intensity);

    if (expressionTimerRef.current) {
      clearTimeout(expressionTimerRef.current);
      expressionTimerRef.current = null;
    }

    // 自动清除表情
    expressionTimerRef.current = setTimeout(() => {
      setState(prev => ({ 
        ...prev, 
        currentExpression: null,
      }));
      setLipSyncEnergy(0);
      expressionTimerRef.current = null;
    }, feedback.duration);
  }, [setLipSyncEnergy]);

  const triggerMotion = useCallback((feedback: MotionFeedback) => {
    // 触发动作反馈 - 由具体组件实现
    console.log('[TouchInteraction] Motion triggered:', feedback);
  }, []);

  const triggerVisualFeedback = useCallback((feedback: VisualFeedback) => {
    // 视觉反馈由具体UI组件处理
    console.log('[TouchInteraction] Visual feedback:', feedback);
  }, []);

  // ========================================================================
  // Click Handlers
  // ========================================================================

  const handleDoubleClick = useCallback((position: Vector2, zoneId?: string) => {
    const zone = zoneId ? hitZonesRef.current.get(zoneId) : null;
    
    const gesture: ClickGesture = {
      id: crypto.randomUUID(),
      type: 'doubleClick',
      position,
      startTime: Date.now(),
      duration: 0,
      targetZone: zone || null,
      pressure: 0.8,
    };
    
    addToHistory(gesture);
    
    if (zone) {
      triggerExpression({
        emotion: 'surprised',
        intensity: 0.9,
        duration: 800,
        blendTime: 200,
      });
    }

    setState(prev => ({ 
      ...prev, 
      activeGesture: gesture,
      currentHitZone: zone || null,
    }));
  }, [addToHistory, triggerExpression]);

  const handleClick = useCallback((position: Vector2, zoneId?: string) => {
    const zone = zoneId ? hitZonesRef.current.get(zoneId) : null;
    if (zone && isInCooldown(zone.id)) {
      return;
    }

    const now = Date.now();
    const previousClick = lastClickRef.current;
    const currentZoneId = zone?.id ?? null;
    const previousZoneId = previousClick?.zoneId ?? null;
    const withinDoubleTime = !!previousClick && now - previousClick.startTime <= DOUBLE_CLICK_THRESHOLD;
    const withinDoubleDistance = !!previousClick && Math.hypot(
      position.x - previousClick.position.x,
      position.y - previousClick.position.y
    ) <= DOUBLE_CLICK_MAX_DISTANCE;
    const sameZone = previousZoneId === currentZoneId;

    if (withinDoubleTime && withinDoubleDistance && sameZone) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      lastClickRef.current = null;
      handleDoubleClick(position, zoneId);
      return;
    }

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    lastClickRef.current = {
      position,
      zoneId: currentZoneId,
      startTime: now,
    };

    clickTimerRef.current = setTimeout(() => {
      const latestClick = lastClickRef.current;
      if (!latestClick || latestClick.startTime !== now) {
        return;
      }

      const gesture: ClickGesture = {
        id: crypto.randomUUID(),
        type: 'click',
        position,
        startTime: now,
        duration: 0,
        targetZone: zone || null,
        pressure: 0.5,
      };

      activeGestureRef.current = gesture;
      addToHistory(gesture);
      if (zone) {
        setCooldown(zone.id);

        const zoneExpressions: Record<string, EmotionType> = {
          head: 'happy',
          face: 'embarrassed',
          leftHand: 'happy',
          rightHand: 'happy',
          body: 'relaxed',
          shoulders: 'relaxed',
        };

        triggerExpression({
          emotion: zoneExpressions[zone.id] || 'happy',
          intensity: 0.7,
          duration: DEFAULT_EXPRESSION_DURATION,
          blendTime: DEFAULT_BLEND_TIME,
        });
      }

      setState((prev) => ({
        ...prev,
        activeGesture: gesture,
        currentHitZone: zone || null,
      }));

      setTimeout(() => {
        activeGestureRef.current = null;
        setState((prev) => ({ ...prev, activeGesture: null }));
      }, 100);

      lastClickRef.current = null;
      clickTimerRef.current = null;
    }, SINGLE_CLICK_COMMIT_DELAY);
  }, [addToHistory, handleDoubleClick, isInCooldown, setCooldown, triggerExpression]);

  const handleLongPress = useCallback((position: Vector2, zoneId?: string) => {
    const zone = zoneId ? hitZonesRef.current.get(zoneId) : null;
    
    const gesture: ClickGesture = {
      id: crypto.randomUUID(),
      type: 'longPress',
      position,
      startTime: Date.now(),
      duration: LONG_PRESS_THRESHOLD,
      targetZone: zone || null,
      pressure: 1.0,
    };
    
    addToHistory(gesture);
    
    if (zone) {
      triggerExpression({
        emotion: zone.id === 'head' ? 'relaxed' : 'happy',
        intensity: 0.6,
        duration: 1500,
        blendTime: 400,
      });
    }

    setState(prev => ({ 
      ...prev, 
      activeGesture: gesture,
      currentHitZone: zone || null,
    }));
  }, [addToHistory, triggerExpression]);

  // ========================================================================
  // Drag Handlers
  // ========================================================================

  const handleDragStart = useCallback((position: Vector2, zoneId?: string) => {
    const zone = zoneId ? hitZonesRef.current.get(zoneId) : null;
    
    const gesture: DragGesture = {
      id: crypto.randomUUID(),
      type: 'drag',
      position,
      startPosition: position,
      startTime: Date.now(),
      duration: 0,
      targetZone: zone || null,
      delta: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
    };
    
    activeGestureRef.current = gesture;
    
    setState(prev => ({ 
      ...prev, 
      activeGesture: gesture,
      currentHitZone: zone || null,
    }));
  }, []);

  const handleDragMove = useCallback((position: Vector2, delta: Vector2) => {
    const activeGesture = activeGestureRef.current;
    if (!activeGesture || activeGesture.type !== 'drag') return;
    
    const dragGesture = activeGesture as DragGesture;
    const velocity = {
      x: delta.x / 16, // 假设60fps
      y: delta.y / 16,
    };
    
    const updatedGesture: DragGesture = {
      ...dragGesture,
      position,
      delta: {
        x: dragGesture.delta.x + delta.x,
        y: dragGesture.delta.y + delta.y,
      },
      velocity,
      duration: Date.now() - dragGesture.startTime,
    };
    
    activeGestureRef.current = updatedGesture;
    
    setState(prev => ({ 
      ...prev, 
      activeGesture: updatedGesture,
    }));
  }, []);

  const handleDragEnd = useCallback(() => {
    const activeGesture = activeGestureRef.current;
    if (!activeGesture || activeGesture.type !== 'drag') return;
    
    activeGestureRef.current = null;
    
    setState(prev => ({ 
      ...prev, 
      activeGesture: null,
    }));
  }, []);

  // ========================================================================
  // Hover Handlers
  // ========================================================================

  const handleHoverEnter = useCallback((position: Vector2, zoneId?: string) => {
    const zone = zoneId ? hitZonesRef.current.get(zoneId) : null;
    
    const gesture: HoverGesture = {
      id: crypto.randomUUID(),
      type: 'hover',
      position,
      startTime: Date.now(),
      duration: 0,
      targetZone: zone || null,
    };
    
    setState(prev => ({ 
      ...prev, 
      isHovering: true,
      hoverPosition: position,
      activeGesture: gesture,
      currentHitZone: zone || null,
    }));
  }, []);

  const handleHoverMove = useCallback((position: Vector2) => {
    setState(prev => {
      if (!prev.activeGesture || prev.activeGesture.type !== 'hover') {
        return prev;
      }
      
      const hoverGesture = prev.activeGesture as HoverGesture;
      return {
        ...prev,
        hoverPosition: position,
        activeGesture: {
          ...hoverGesture,
          position,
          duration: Date.now() - hoverGesture.startTime,
        },
      };
    });
  }, []);

  const handleHoverLeave = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      isHovering: false,
      hoverPosition: null,
      activeGesture: null,
      currentHitZone: null,
    }));
  }, []);

  useEffect(() => () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    if (expressionTimerRef.current) {
      clearTimeout(expressionTimerRef.current);
      expressionTimerRef.current = null;
    }
    setLipSyncEnergy(0);
    lastClickRef.current = null;
  }, [setLipSyncEnergy]);

  // ========================================================================
  // Context Value
  // ========================================================================

  const contextValue = useMemo<TouchInteractionContextValue>(() => ({
    registerHitZone,
    unregisterHitZone,
    getHitZone,
    getAllHitZones,
    triggerExpression,
    triggerMotion,
    triggerVisualFeedback,
    handleClick,
    handleDoubleClick,
    handleLongPress,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleHoverEnter,
    handleHoverMove,
    handleHoverLeave,
    state,
    isInCooldown,
    clearHistory,
  }), [
    registerHitZone,
    unregisterHitZone,
    getHitZone,
    getAllHitZones,
    triggerExpression,
    triggerMotion,
    triggerVisualFeedback,
    handleClick,
    handleDoubleClick,
    handleLongPress,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleHoverEnter,
    handleHoverMove,
    handleHoverLeave,
    state,
    isInCooldown,
    clearHistory,
  ]);

  return (
    <TouchInteractionContext.Provider value={contextValue}>
      {children}
    </TouchInteractionContext.Provider>
  );
}

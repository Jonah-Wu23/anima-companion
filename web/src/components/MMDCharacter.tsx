"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Animation, ModelStatus, MotionState } from '@/lib/api/types';
import {
  useTouchInteraction,
  type InteractionType,
} from '@/lib/interaction/TouchInteractionProvider';
import { RaycastManager, type RaycastZoneConfig } from '@/lib/interaction/RaycastManager';
import { ExpressionDriver, type ExpressionEmotion } from '@/lib/mmd/expression-driver';
import { MMDAnimationManager, type AnimationSnapshot } from '@/lib/mmd/mmd-animation';
import { MemoryMonitor } from '@/lib/mmd/memory-monitor';
import { disposeMMDMesh, getMMDTextureCacheStats, loadPMX, loadVMDAnimation } from '@/lib/mmd/mmd-loader';
import { MotionCache } from '@/lib/mmd/motion-cache';
import { MotionManifestLoader } from '@/lib/mmd/motion-manifest';
import { MotionDriver, type MotionTouchZone } from '@/lib/mmd/motion-driver';
import { MotionStateMachine } from '@/lib/mmd/motion-state-machine';
import { useAvatarStore } from '@/lib/store/avatarStore';
import { usePipelineStore, type PipelineStage } from '@/lib/store/pipelineStore';

const PRELOAD_STATES: MotionState[] = ['idle', 'listening', 'speaking', 'thinking', 'error'];
const SPEAKING_RANDOM_POOL_SIZE = 2;
const TALK8_MOTION_IDS = new Set(['phainon_bg_loop_chat_015', 'phainon_bg_loop_chat_016']);
const TALK8_INSTANT_FADE_DURATION = 0;
const DRAG_THRESHOLD_PX = 10;
const TOUCH_MOVE_THROTTLE_MS = 1000 / 60;
const HIT_ZONE_SYNC_INTERVAL_MS = 1000 / 30;
const LONG_PRESS_THRESHOLD_MS = 500;
const HOVER_FOLLOW_HALF_RANGE = 0.16;

type TouchGestureKind = 'click' | 'doubleClick' | 'longPress' | 'dragStart';

interface TouchReaction {
  emotion: ExpressionEmotion;
  intensity: number;
  durationMs: number;
  blendInMs: number;
  blendOutMs: number;
}

interface TouchPointerState {
  pointerId: number;
  pointerType: string;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  zoneId: string | null;
  dragging: boolean;
  longPressTriggered: boolean;
  clickSuppressed: boolean;
}

interface BoneAnchors {
  head: THREE.Bone | null;
  neck: THREE.Bone | null;
  eyes: THREE.Bone[];
  leftHand: THREE.Bone | null;
  rightHand: THREE.Bone | null;
  leftShoulder: THREE.Bone | null;
  rightShoulder: THREE.Bone | null;
  upperBody: THREE.Bone | null;
}

export interface MMDCharacterProps {
  modelId?: string;
  modelPath: string;
  manifestPath: string;
  fadeDuration?: number;
  onLoadProgress?: (progress: number, message: string) => void;
  onStatusChange?: (status: ModelStatus, detail?: string) => void;
  onMotionChange?: (motionName: string) => void;
  onModelLoadStart?: () => void;
  onModelLoadProgress?: (progress: number) => void;
  onModelLoadComplete?: () => void;
  onModelLoadError?: (error: Error) => void;
}

function toResourcePath(url: string): string {
  const normalized = url.replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex < 0) {
    return '/';
  }
  return normalized.slice(0, slashIndex + 1);
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return '未知加载错误';
}

type MMDToonLikeMaterial = THREE.Material & {
  matcap?: THREE.Texture | null;
  matcapCombine?: number;
  needsUpdate?: boolean;
};

function isHairMaterialName(name: string): boolean {
  const normalized = name.trim();
  return normalized === '髪' || normalized === '髪2';
}

function pickRandomMotion(motions: string[], previous: string | null): string {
  if (motions.length <= 1) {
    return motions[0];
  }

  const withoutPrevious = previous ? motions.filter((name) => name !== previous) : motions;
  const pool = withoutPrevious.length > 0 ? withoutPrevious : motions;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

function toMotionTouchZone(zoneId: string | null | undefined): MotionTouchZone | null {
  if (
    zoneId === 'head' ||
    zoneId === 'face' ||
    zoneId === 'eyes' ||
    zoneId === 'leftHand' ||
    zoneId === 'rightHand' ||
    zoneId === 'body' ||
    zoneId === 'shoulders'
  ) {
    return zoneId;
  }
  return null;
}

function isDragEnabledZone(zoneId: MotionTouchZone | null): zoneId is 'head' | 'body' | 'shoulders' {
  return zoneId === 'head' || zoneId === 'body' || zoneId === 'shoulders';
}

function findBoneByCandidates(mesh: THREE.SkinnedMesh, candidates: string[]): THREE.Bone | null {
  const bones = mesh.skeleton?.bones ?? [];
  const normalized = candidates.map((item) => item.toLowerCase());
  for (const bone of bones) {
    const name = bone.name.toLowerCase();
    if (normalized.some((candidate) => name.includes(candidate))) {
      return bone;
    }
  }
  return null;
}

function findBonesByCandidates(mesh: THREE.SkinnedMesh, candidates: string[]): THREE.Bone[] {
  const bones = mesh.skeleton?.bones ?? [];
  const normalized = candidates.map((item) => item.toLowerCase());
  return bones.filter((bone) => {
    const name = bone.name.toLowerCase();
    return normalized.some((candidate) => name.includes(candidate));
  });
}

function resolveBoneAnchors(mesh: THREE.SkinnedMesh): BoneAnchors {
  return {
    head: findBoneByCandidates(mesh, ['頭', 'head']),
    neck: findBoneByCandidates(mesh, ['首', 'neck']),
    eyes: findBonesByCandidates(mesh, ['両目', '左目', '右目', 'eye']),
    leftHand: findBoneByCandidates(mesh, ['左手首', 'leftwrist', 'lefthand', 'l_wrist', '左ひじ']),
    rightHand: findBoneByCandidates(mesh, ['右手首', 'rightwrist', 'righthand', 'r_wrist', '右ひじ']),
    leftShoulder: findBoneByCandidates(mesh, ['左肩', 'leftshoulder', 'l_shoulder']),
    rightShoulder: findBoneByCandidates(mesh, ['右肩', 'rightshoulder', 'r_shoulder']),
    upperBody: findBoneByCandidates(mesh, ['上半身2', '上半身', 'spine', 'chest']),
  };
}

function resolveTouchReaction(zoneId: MotionTouchZone, gesture: TouchGestureKind): TouchReaction {
  if (gesture === 'doubleClick') {
    return {
      emotion: 'surprised',
      intensity: 0.9,
      durationMs: 700,
      blendInMs: 120,
      blendOutMs: 220,
    };
  }

  if (gesture === 'longPress') {
    if (zoneId === 'head' || zoneId === 'face' || zoneId === 'eyes') {
      return {
        emotion: 'relaxed',
        intensity: 0.72,
        durationMs: 1600,
        blendInMs: 180,
        blendOutMs: 360,
      };
    }
    return {
      emotion: 'happy',
      intensity: 0.65,
      durationMs: 1300,
      blendInMs: 180,
      blendOutMs: 300,
    };
  }

  if (gesture === 'dragStart') {
    return {
      emotion: zoneId === 'body' || zoneId === 'shoulders' ? 'relaxed' : 'happy',
      intensity: 0.5,
      durationMs: 900,
      blendInMs: 140,
      blendOutMs: 220,
    };
  }

  if (zoneId === 'face' || zoneId === 'eyes') {
    return {
      emotion: 'embarrassed',
      intensity: 0.82,
      durationMs: 1400,
      blendInMs: 140,
      blendOutMs: 320,
    };
  }
  if (zoneId === 'head') {
    return {
      emotion: 'happy',
      intensity: 0.74,
      durationMs: 1000,
      blendInMs: 120,
      blendOutMs: 260,
    };
  }
  if (zoneId === 'leftHand' || zoneId === 'rightHand') {
    return {
      emotion: 'happy',
      intensity: 0.7,
      durationMs: 900,
      blendInMs: 110,
      blendOutMs: 220,
    };
  }
  return {
    emotion: 'relaxed',
    intensity: 0.62,
    durationMs: 1000,
    blendInMs: 120,
    blendOutMs: 220,
  };
}

function normalizeExpressionEmotion(value: string): ExpressionEmotion {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'shy') {
    return 'embarrassed';
  }
  if (
    normalized === 'neutral' ||
    normalized === 'happy' ||
    normalized === 'sad' ||
    normalized === 'angry' ||
    normalized === 'surprised' ||
    normalized === 'embarrassed' ||
    normalized === 'excited' ||
    normalized === 'relaxed' ||
    normalized === 'worried'
  ) {
    return normalized;
  }
  return 'neutral';
}

function createHitZoneConfigs(mesh: THREE.SkinnedMesh): RaycastZoneConfig[] {
  const anchors = resolveBoneAnchors(mesh);
  const worldBox = new THREE.Box3().setFromObject(mesh);
  const worldCenter = worldBox.getCenter(new THREE.Vector3());
  const worldSize = worldBox.getSize(new THREE.Vector3());
  const characterHeight = Math.max(worldSize.y, 1);
  const preciseTargets = () => [mesh as THREE.Object3D];

  const fallback = (ratio: number) => (target: THREE.Vector3) =>
    target.copy(worldCenter).add(new THREE.Vector3(0, characterHeight * ratio, 0));
  const boneCenter = (bone: THREE.Bone | null, fallbackRatio: number) => (target: THREE.Vector3) => {
    if (bone) {
      bone.getWorldPosition(target);
      return target;
    }
    return fallback(fallbackRatio)(target);
  };
  const averageBonesCenter =
    (bones: THREE.Bone[], fallbackRatio: number) => (target: THREE.Vector3) => {
      if (bones.length === 0) {
        return fallback(fallbackRatio)(target);
      }
      target.set(0, 0, 0);
      const tmp = new THREE.Vector3();
      bones.forEach((bone) => {
        bone.getWorldPosition(tmp);
        target.add(tmp);
      });
      target.multiplyScalar(1 / bones.length);
      return target;
    };
  const shouldersCenter = (target: THREE.Vector3) => {
    if (anchors.leftShoulder && anchors.rightShoulder) {
      const left = new THREE.Vector3();
      const right = new THREE.Vector3();
      anchors.leftShoulder.getWorldPosition(left);
      anchors.rightShoulder.getWorldPosition(right);
      return target.copy(left).add(right).multiplyScalar(0.5);
    }
    return boneCenter(anchors.upperBody, 0)(target);
  };

  return [
    {
      id: 'head',
      name: '头部',
      priority: 10,
      enabled: true,
      allowedInteractions: ['click', 'doubleClick', 'longPress', 'drag', 'hover'],
      // 适度放大头部命中盒，提升 hover 可达性（避免必须贴得很近才触发）。
      size: new THREE.Vector3(characterHeight * 0.15, characterHeight * 0.15, characterHeight * 0.15),
      getCenterWorld: boneCenter(anchors.head ?? anchors.neck, 0.28),
      getPreciseTargets: preciseTargets,
    },
    {
      id: 'face',
      name: '脸部',
      priority: 9,
      enabled: true,
      allowedInteractions: ['click', 'doubleClick', 'longPress', 'hover'],
      size: new THREE.Vector3(characterHeight * 0.12, characterHeight * 0.12, characterHeight * 0.12),
      getCenterWorld: anchors.eyes.length > 0
        ? averageBonesCenter(anchors.eyes, 0.26)
        : boneCenter(anchors.head, 0.24),
      getPreciseTargets: preciseTargets,
    },
    {
      id: 'eyes',
      name: '眼睛',
      priority: 8,
      enabled: true,
      allowedInteractions: ['hover', 'click'],
      size: new THREE.Vector3(characterHeight * 0.11, characterHeight * 0.08, characterHeight * 0.09),
      getCenterWorld: anchors.eyes.length > 0
        ? averageBonesCenter(anchors.eyes, 0.26)
        : boneCenter(anchors.head, 0.25),
      getPreciseTargets: preciseTargets,
    },
    {
      id: 'leftHand',
      name: '左手',
      priority: 7,
      enabled: true,
      allowedInteractions: ['click', 'doubleClick', 'hover'],
      size: new THREE.Vector3(characterHeight * 0.12, characterHeight * 0.14, characterHeight * 0.12),
      getCenterWorld: boneCenter(anchors.leftHand, -0.02),
      getPreciseTargets: preciseTargets,
    },
    {
      id: 'rightHand',
      name: '右手',
      priority: 7,
      enabled: true,
      allowedInteractions: ['click', 'doubleClick', 'hover'],
      size: new THREE.Vector3(characterHeight * 0.12, characterHeight * 0.14, characterHeight * 0.12),
      getCenterWorld: boneCenter(anchors.rightHand, -0.02),
      getPreciseTargets: preciseTargets,
    },
    {
      id: 'shoulders',
      name: '肩膀',
      priority: 6,
      enabled: true,
      allowedInteractions: ['click', 'doubleClick', 'drag', 'hover'],
      size: new THREE.Vector3(characterHeight * 0.2, characterHeight * 0.11, characterHeight * 0.14),
      getCenterWorld: shouldersCenter,
      getPreciseTargets: preciseTargets,
    },
    {
      id: 'body',
      name: '身体',
      priority: 5,
      enabled: true,
      allowedInteractions: ['click', 'doubleClick', 'drag', 'hover'],
      size: new THREE.Vector3(characterHeight * 0.22, characterHeight * 0.26, characterHeight * 0.16),
      getCenterWorld: boneCenter(anchors.upperBody, 0),
      getPreciseTargets: preciseTargets,
    },
  ];
}

export function MMDCharacter({
  modelId,
  modelPath,
  manifestPath,
  fadeDuration,
  onLoadProgress,
  onStatusChange,
  onMotionChange,
  onModelLoadStart,
  onModelLoadProgress,
  onModelLoadComplete,
  onModelLoadError,
}: MMDCharacterProps) {
  const [mesh, setMesh] = useState<THREE.SkinnedMesh | null>(null);
  const { camera, gl } = useThree();

  const stage = usePipelineStore((state) => state.stage);
  const avatarAnimation = usePipelineStore((state) => state.avatarAnimation);
  const lipSyncEnergy = usePipelineStore((state) => state.lipSyncEnergy);
  const avatarEmotion = useAvatarStore((state) => state.emotion);
  const currentMotion = useAvatarStore((state) => state.currentMotion);

  const {
    registerHitZone,
    unregisterHitZone,
    handleClick,
    handleLongPress,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleHoverEnter,
    handleHoverMove,
    handleHoverLeave,
    state: touchState,
  } = useTouchInteraction();

  const setModelStatus = useAvatarStore((state) => state.setModelStatus);
  const setModelProgress = useAvatarStore((state) => state.setModelProgress);
  const setCurrentMotion = useAvatarStore((state) => state.setCurrentMotion);
  const setSceneStatus = useAvatarStore((state) => state.setSceneStatus);

  const managerRef = useRef<MMDAnimationManager | null>(null);
  const motionMapRef = useRef<Partial<Record<MotionState, string>>>({});
  const motionPoolRef = useRef<Partial<Record<MotionState, string[]>>>({});
  const activeSpeakingMotionRef = useRef<string | null>(null);
  const meshRef = useRef<THREE.SkinnedMesh | null>(null);
  const meshBaseRotationYRef = useRef(0);
  const stateMachineRef = useRef(new MotionStateMachine());
  const cacheRef = useRef(new MotionCache(12));
  const raycastManagerRef = useRef<RaycastManager | null>(null);
  const expressionDriverRef = useRef<ExpressionDriver | null>(null);
  const motionDriverRef = useRef<MotionDriver | null>(null);
  const frameTokenRef = useRef(0);
  const pendingAnimationSnapshotRef = useRef<AnimationSnapshot | null>(null);
  const memoryMonitorRef = useRef<MemoryMonitor | null>(null);
  const zoneIdsRef = useRef<string[]>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerStateRef = useRef<TouchPointerState | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const lastTouchMoveAtRef = useRef(0);
  const lastZoneSyncAtRef = useRef(0);
  const lastGestureHandledIdRef = useRef<string | null>(null);
  const mouseHoverZoneIdRef = useRef<string | null>(null);

  useEffect(() => {
    memoryMonitorRef.current = new MemoryMonitor(gl, 'mmd-switch');
  }, [gl]);

  const applyTouchReaction = useCallback((zoneId: MotionTouchZone, gesture: TouchGestureKind) => {
    const reaction = resolveTouchReaction(zoneId, gesture);
    expressionDriverRef.current?.triggerEmotion(reaction.emotion, {
      intensity: reaction.intensity,
      durationMs: reaction.durationMs,
      blendInMs: reaction.blendInMs,
      blendOutMs: reaction.blendOutMs,
    });
    if (gesture !== 'dragStart') {
      const motionIntensity = gesture === 'doubleClick' ? 0.95 : gesture === 'longPress' ? 0.6 : 0.75;
      motionDriverRef.current?.triggerTap(zoneId, motionIntensity);
    }
  }, []);

  const emitStatus = useCallback(
    (status: ModelStatus, detail?: string) => {
      setModelStatus(status);
      if (status === 'ready') {
        setSceneStatus('ready');
      } else if (status === 'error') {
        setSceneStatus('error');
      } else {
        setSceneStatus('loading');
      }
      onStatusChange?.(status, detail);
    },
    [onStatusChange, setModelStatus, setSceneStatus]
  );

  const emitProgress = useCallback(
    (progress: number, message: string) => {
      const safe = Math.max(0, Math.min(100, progress));
      setModelProgress(safe);
      onLoadProgress?.(safe, message);
      onModelLoadProgress?.(safe);
    },
    [onLoadProgress, onModelLoadProgress, setModelProgress]
  );

  const applyMotion = useCallback(
    (nextStage: PipelineStage, nextAnimation: Animation) => {
      const manager = managerRef.current;
      if (!manager) {
        return;
      }

      const state = stateMachineRef.current.resolveMotion({
        stage: nextStage,
        avatarAnimation: nextAnimation,
      });
      let mappedMotion = motionMapRef.current[state] ?? motionMapRef.current.idle;
      if (state === 'speaking') {
        const speakingPool = motionPoolRef.current.speaking ?? [];
        if (speakingPool.length > 0) {
          activeSpeakingMotionRef.current = pickRandomMotion(speakingPool, activeSpeakingMotionRef.current);
          mappedMotion = activeSpeakingMotionRef.current;
        }
      } else {
        activeSpeakingMotionRef.current = null;
      }

      if (!mappedMotion) {
        return;
      }

      const currentMesh = meshRef.current;
      let playFadeDuration = fadeDuration;
      if (currentMesh) {
        const hasTalk8Offset = state === 'speaking' && TALK8_MOTION_IDS.has(mappedMotion);
        currentMesh.rotation.y = meshBaseRotationYRef.current + (hasTalk8Offset ? -Math.PI / 2 : 0);
        if (hasTalk8Offset) {
          playFadeDuration = TALK8_INSTANT_FADE_DURATION;
        }
      }

      manager.play(mappedMotion, playFadeDuration);
      setCurrentMotion(mappedMotion);
      onMotionChange?.(mappedMotion);
    },
    [fadeDuration, onMotionChange, setCurrentMotion]
  );

  useEffect(() => {
    if (!touchState.activeGesture) {
      return;
    }
    const gesture = touchState.activeGesture;
    if (gesture.type === 'drag' || gesture.type === 'hover') {
      return;
    }
    if (lastGestureHandledIdRef.current === gesture.id) {
      return;
    }
    lastGestureHandledIdRef.current = gesture.id;
    const zoneId = toMotionTouchZone(gesture.targetZone?.id);
    if (!zoneId) {
      return;
    }
    applyTouchReaction(zoneId, gesture.type);
  }, [applyTouchReaction, touchState.activeGesture]);

  useEffect(() => {
    motionDriverRef.current?.setPipelineStage(stage);
    expressionDriverRef.current?.setPipelineStage(stage);
  }, [stage]);

  useEffect(() => {
    let cancelled = false;
    let localMesh: THREE.SkinnedMesh | null = null;
    let localManager: MMDAnimationManager | null = null;
    const snapshotToRestore = pendingAnimationSnapshotRef.current;
    const memoryBefore = memoryMonitorRef.current?.capture() ?? null;

    if (memoryBefore) {
      memoryMonitorRef.current?.logSnapshot(
        memoryBefore,
        `before-switch:${modelId ?? modelPath}`
      );
    }

    const run = async () => {
      try {
        onModelLoadStart?.();
        emitStatus('loading', '开始加载 MMD 资源');
        emitProgress(0, '读取动作清单');

        const manifestLoader = new MotionManifestLoader(manifestPath);
        await manifestLoader.load();

        if (cancelled) {
          return;
        }

        emitProgress(10, '加载 PMX 模型');
        localMesh = await loadPMX(modelPath, {
          resourcePath: toResourcePath(modelPath),
          useTextureCache: true,
          onProgress: (progress) => emitProgress(10 + progress * 0.5, '加载 PMX 模型'),
        });
        meshRef.current = localMesh;
        meshBaseRotationYRef.current = localMesh.rotation.y;

        if (cancelled) {
          disposeMMDMesh(localMesh);
          return;
        }

        // 优化模型材质，避免过曝
        localMesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            
            // 优化 MMD 材质表现，避免过曝
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => {
              // 处理带自发光的材质（MeshStandardMaterial, MeshToonMaterial 等）
              if ((material as THREE.MeshStandardMaterial).emissive) {
                const stdMaterial = material as THREE.MeshStandardMaterial;
                // 降低自发光强度，避免过曝
                stdMaterial.emissiveIntensity = 0;
              }

              // 仅针对头发材质：将 MatCap 混合从加算改为乘算，避免被高亮球面贴图冲白
              if (isHairMaterialName(material.name)) {
                const toonMaterial = material as MMDToonLikeMaterial;
                if (typeof toonMaterial.matcapCombine === 'number') {
                  toonMaterial.matcapCombine = THREE.MultiplyOperation;
                }
                toonMaterial.matcap = null;
                toonMaterial.needsUpdate = true;
              }
              
              // 如果是 MeshBasicMaterial，不响应光照，需要特殊处理
              if (material.type === 'MeshBasicMaterial') {
                const basicMaterial = material as THREE.MeshBasicMaterial;
                // MeshBasicMaterial 不参与光照计算，保持原样
                // 但如果颜色过亮，可以适当降低
                if (basicMaterial.color) {
                  const color = basicMaterial.color;
                  // 如果颜色亮度太高，稍微降低
                  const hsl = { h: 0, s: 0, l: 0 };
                  color.getHSL(hsl);
                  if (hsl.l > 0.9) {
                    color.setHSL(hsl.h, hsl.s, 0.85);
                  }
                }
              }
            });
          }
        });

        emitProgress(60, '初始化动画控制器');
        localManager = new MMDAnimationManager(localMesh, { fadeDuration });
        managerRef.current = localManager;
        expressionDriverRef.current = new ExpressionDriver(localMesh);
        expressionDriverRef.current.setBaseEmotion(
          normalizeExpressionEmotion(useAvatarStore.getState().emotion),
          { intensity: 0.58 }
        );
        expressionDriverRef.current.setPipelineStage(usePipelineStore.getState().stage);
        expressionDriverRef.current.setLipSyncEnergy(usePipelineStore.getState().lipSyncEnergy);
        expressionDriverRef.current.setCurrentMotion(String(useAvatarStore.getState().currentMotion || ''));
        motionDriverRef.current = new MotionDriver(localMesh);
        motionDriverRef.current.setPipelineStage(usePipelineStore.getState().stage);

        const resolvedMotionMap: Partial<Record<MotionState, string>> = {};
        const resolvedMotionPool: Partial<Record<MotionState, string[]>> = {};
        let loadedCount = 0;
        const totalStates = PRELOAD_STATES.length;

        for (const state of PRELOAD_STATES) {
          const candidates =
            state === 'speaking'
              ? manifestLoader.getCandidates('speaking', true).slice(0, SPEAKING_RANDOM_POOL_SIZE)
              : (() => {
                  const best = manifestLoader.resolveBestCandidate(state, { includeFallback: true });
                  return best ? [best] : [];
                })();

          if (candidates.length === 0) {
            continue;
          }

          const loadedMotions: string[] = [];
          for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
            const candidate = candidates[candidateIndex];
            const motionUrl = manifestLoader.resolvePublicPath(candidate.path);

            try {
              let clip = cacheRef.current.get(motionUrl);
              if (!clip) {
                clip = await loadVMDAnimation(motionUrl, localMesh, {
                  onProgress: (progress) => {
                    const stateBase = 60 + (loadedCount / totalStates) * 35;
                    const stateSpan = 35 / totalStates;
                    const candidateSpan = stateSpan / candidates.length;
                    const candidateBase = stateBase + candidateSpan * candidateIndex;
                    emitProgress(
                      candidateBase + (progress / 100) * candidateSpan,
                      `加载动作: ${candidate.asset_id}`
                    );
                  },
                });
                cacheRef.current.set(motionUrl, clip);
              }

              localManager.registerClip(candidate.asset_id, clip, {
                loop: state !== 'error',
              });
              loadedMotions.push(candidate.asset_id);
            } catch (error) {
              if (state !== 'speaking') {
                throw error;
              }
              if (process.env.NODE_ENV === 'development') {
                console.warn(`[mmd] speaking 动作加载失败，跳过 ${candidate.asset_id}`, error);
              }
            }
          }

          if (loadedMotions.length === 0) {
            continue;
          }

          resolvedMotionMap[state] = loadedMotions[0];
          resolvedMotionPool[state] = loadedMotions;
          loadedCount += 1;
        }

        motionMapRef.current = resolvedMotionMap;
        motionPoolRef.current = resolvedMotionPool;
        setMesh(localMesh);

        if (snapshotToRestore) {
          localManager.restoreSnapshot(snapshotToRestore, 0);
          pendingAnimationSnapshotRef.current = null;
          const restoredMotion = localManager.getCurrentActionName();
          if (restoredMotion) {
            setCurrentMotion(restoredMotion);
            onMotionChange?.(restoredMotion);
          }
        }

        if (!localManager.getCurrentActionName()) {
          const { stage: currentStage, avatarAnimation: currentAnimation } = usePipelineStore.getState();
          applyMotion(currentStage, currentAnimation);
        }

        emitProgress(100, 'MMD 资源加载完成');
        emitStatus('ready');
        onModelLoadComplete?.();

        const memoryAfter = memoryMonitorRef.current?.capture() ?? null;
        if (memoryBefore && memoryAfter) {
          memoryMonitorRef.current?.logComparison(
            memoryBefore,
            memoryAfter,
            `after-switch:${modelId ?? modelPath}`
          );
          if (memoryMonitorRef.current?.shouldForceCleanup(memoryAfter) && process.env.NODE_ENV === 'development') {
            console.warn('[mmd] 内存指标偏高，建议检查连续换装后的资源释放');
          }
        }

        if (process.env.NODE_ENV === 'development') {
          console.info('[mmd-texture-cache] stats', getMMDTextureCacheStats());
        }
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(normalizeError(error));
        const message = normalizeError(error);
        emitProgress(0, `加载失败: ${message}`);
        emitStatus('error', message);
        onModelLoadError?.(normalizedError);
        const managerToDispose = localManager ?? managerRef.current;
        if (managerToDispose) {
          if (managerRef.current === managerToDispose) {
            managerRef.current = null;
          }
          managerToDispose.dispose();
          localManager = null;
        }
        if (localMesh) {
          disposeMMDMesh(localMesh);
          localMesh = null;
        }
        setMesh(null);
        expressionDriverRef.current?.clear(true);
        expressionDriverRef.current = null;
        motionDriverRef.current?.dispose();
        motionDriverRef.current = null;
      }
    };

    run();

    return () => {
      cancelled = true;
      const managerToDispose = localManager ?? managerRef.current;
      if (managerToDispose) {
        pendingAnimationSnapshotRef.current = managerToDispose.captureSnapshot();
        if (managerRef.current === managerToDispose) {
          managerRef.current = null;
        }
        managerToDispose.dispose();
        localManager = null;
      } else {
        managerRef.current = null;
      }
      motionMapRef.current = {};
      motionPoolRef.current = {};
      activeSpeakingMotionRef.current = null;
      meshRef.current = null;
      setMesh(null);
      expressionDriverRef.current?.clear(true);
      expressionDriverRef.current = null;
      motionDriverRef.current?.dispose();
      motionDriverRef.current = null;
      if (localMesh) {
        disposeMMDMesh(localMesh);
        localMesh = null;
      }
    };
  }, [
    applyMotion,
    emitProgress,
    emitStatus,
    fadeDuration,
    manifestPath,
    modelId,
    modelPath,
    onModelLoadComplete,
    onModelLoadError,
    onModelLoadStart,
    onMotionChange,
    setCurrentMotion,
  ]);

  useEffect(() => {
    if (!mesh) {
      return;
    }

    const raycastManager = new RaycastManager();
    raycastManager.setContext(camera, gl.domElement);
    const zoneConfigs = createHitZoneConfigs(mesh);
    zoneConfigs.forEach((zone) => {
      raycastManager.registerZone(zone);
    });
    raycastManagerRef.current = raycastManager;
    zoneIdsRef.current = zoneConfigs.map((zone) => zone.id);

    raycastManager.getAllZoneBoundsSnapshot().forEach((zone) => {
      registerHitZone({
        id: zone.id,
        name: zone.name,
        bounds: {
          center: { x: zone.center.x, y: zone.center.y, z: zone.center.z },
          size: { x: zone.size.x, y: zone.size.y, z: zone.size.z },
        },
        priority: zone.priority,
        enabled: zone.enabled,
        allowedInteractions: zone.allowedInteractions,
      });
    });

    const domElement = gl.domElement;
    const previousTouchAction = domElement.style.touchAction;
    domElement.style.touchAction = 'none';

    const clearLongPressTimer = () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const toNormalized = (clientX: number, clientY: number) => {
      const rect = domElement.getBoundingClientRect();
      return {
        x: THREE.MathUtils.clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        y: THREE.MathUtils.clamp((clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
        rect,
      };
    };

    const setHoverFromZone = (zoneId: string | null, normalized: { x: number; y: number }) => {
      if (!zoneId) {
        motionDriverRef.current?.setHover(null, normalized);
        return;
      }

      const zoneSnapshot = raycastManager.getZoneBoundsSnapshot(zoneId);
      if (!zoneSnapshot) {
        motionDriverRef.current?.setHover(toMotionTouchZone(zoneId), normalized);
        return;
      }

      // Hover 判定以命中区域中心为参考，而不是整个 3D 画布中心。
      const zoneCenterNdc = zoneSnapshot.center.clone().project(camera);
      const zoneCenterNormalizedX = THREE.MathUtils.clamp((zoneCenterNdc.x + 1) * 0.5, 0, 1);
      const zoneCenterNormalizedY = THREE.MathUtils.clamp((1 - zoneCenterNdc.y) * 0.5, 0, 1);

      const relativePointer = {
        x: THREE.MathUtils.clamp(
          0.5 + (normalized.x - zoneCenterNormalizedX) / (HOVER_FOLLOW_HALF_RANGE * 2),
          0,
          1
        ),
        y: THREE.MathUtils.clamp(
          0.5 + (normalized.y - zoneCenterNormalizedY) / (HOVER_FOLLOW_HALF_RANGE * 2),
          0,
          1
        ),
      };

      motionDriverRef.current?.setHover(toMotionTouchZone(zoneId), relativePointer);
    };

    const resolveHit = (event: PointerEvent, interactionType: InteractionType) =>
      raycastManager.raycastFromScreen(event.clientX, event.clientY, interactionType);

    const onPointerDown = (event: PointerEvent) => {
      if (activePointerIdRef.current !== null) {
        return;
      }

      const hit = resolveHit(event, 'click');
      const zoneId = hit?.zoneId ?? null;
      activePointerIdRef.current = event.pointerId;
      pointerStateRef.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        zoneId,
        dragging: false,
        longPressTriggered: false,
        clickSuppressed: false,
      };

      try {
        domElement.setPointerCapture(event.pointerId);
      } catch {
        // 部分移动浏览器会在被动监听下抛异常，这里直接降级。
      }

      const normalized = toNormalized(event.clientX, event.clientY);
      if (zoneId) {
        handleHoverEnter({ x: normalized.x, y: normalized.y }, zoneId);
      }
      setHoverFromZone(zoneId, normalized);

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        const current = pointerStateRef.current;
        if (!current || current.dragging) {
          return;
        }
        current.longPressTriggered = true;
        const currentNormalized = toNormalized(current.lastClientX, current.lastClientY);
        handleLongPress(
          { x: currentNormalized.x, y: currentNormalized.y },
          current.zoneId ?? undefined
        );
      }, LONG_PRESS_THRESHOLD_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (activePointerIdRef.current === null) {
        if (event.pointerType !== 'mouse') {
          return;
        }

        const normalized = toNormalized(event.clientX, event.clientY);
        const hit = resolveHit(event, 'hover');
        const nextZoneId = hit?.zoneId ?? null;

        if (mouseHoverZoneIdRef.current !== nextZoneId) {
          if (mouseHoverZoneIdRef.current) {
            handleHoverLeave();
          }
          if (nextZoneId) {
            handleHoverEnter({ x: normalized.x, y: normalized.y }, nextZoneId);
          }
        } else if (nextZoneId) {
          handleHoverMove({ x: normalized.x, y: normalized.y });
        }

        mouseHoverZoneIdRef.current = nextZoneId;
        setHoverFromZone(nextZoneId, normalized);
        return;
      }

      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }
      const pointerState = pointerStateRef.current;
      if (!pointerState) {
        return;
      }

      const now = performance.now();
      if (
        pointerState.pointerType === 'touch' &&
        now - lastTouchMoveAtRef.current < TOUCH_MOVE_THROTTLE_MS
      ) {
        return;
      }
      lastTouchMoveAtRef.current = now;

      const normalized = toNormalized(event.clientX, event.clientY);
      const deltaPixelsX = event.clientX - pointerState.lastClientX;
      const deltaPixelsY = event.clientY - pointerState.lastClientY;
      const movedDistance = Math.hypot(
        event.clientX - pointerState.startClientX,
        event.clientY - pointerState.startClientY
      );

      if (!pointerState.dragging && movedDistance > DRAG_THRESHOLD_PX) {
        clearLongPressTimer();
        const dragZone = toMotionTouchZone(pointerState.zoneId);
        if (!isDragEnabledZone(dragZone)) {
          pointerState.clickSuppressed = true;
        } else {
          pointerState.dragging = true;
          handleDragStart(
            {
              x: THREE.MathUtils.clamp(
                (pointerState.startClientX - normalized.rect.left) / Math.max(normalized.rect.width, 1),
                0,
                1
              ),
              y: THREE.MathUtils.clamp(
                (pointerState.startClientY - normalized.rect.top) / Math.max(normalized.rect.height, 1),
                0,
                1
              ),
            },
            pointerState.zoneId ?? undefined
          );
          motionDriverRef.current?.startDrag(dragZone);
          applyTouchReaction(dragZone, 'dragStart');
        }
      }

      if (pointerState.dragging) {
        const deltaNormalized = {
          x: deltaPixelsX / Math.max(normalized.rect.width, 1),
          // 屏幕坐标系 y 向下为正，这里翻转为“向上为正”以匹配交互直觉。
          y: -deltaPixelsY / Math.max(normalized.rect.height, 1),
        };
        handleDragMove({ x: normalized.x, y: normalized.y }, deltaNormalized);
        motionDriverRef.current?.updateDrag(deltaNormalized);
      } else {
        const hit = resolveHit(event, 'hover');
        const nextZoneId = hit?.zoneId ?? null;
        if (pointerState.zoneId !== nextZoneId) {
          handleHoverLeave();
          if (nextZoneId) {
            handleHoverEnter({ x: normalized.x, y: normalized.y }, nextZoneId);
          }
        } else if (nextZoneId) {
          handleHoverMove({ x: normalized.x, y: normalized.y });
        }
        pointerState.zoneId = nextZoneId;
        setHoverFromZone(nextZoneId, normalized);
      }

      pointerState.lastClientX = event.clientX;
      pointerState.lastClientY = event.clientY;
    };

    const finishPointer = (event: PointerEvent, cancelled: boolean) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      clearLongPressTimer();
      const pointerState = pointerStateRef.current;
      if (!pointerState) {
        return;
      }

      if (pointerState.dragging) {
        handleDragEnd();
        motionDriverRef.current?.endDrag();
      } else if (!cancelled && !pointerState.longPressTriggered && !pointerState.clickSuppressed) {
        const normalized = toNormalized(event.clientX, event.clientY);
        const hit = resolveHit(event, 'click');
        const zoneId = pointerState.zoneId ?? hit?.zoneId ?? undefined;
        handleClick({ x: normalized.x, y: normalized.y }, zoneId);
      }

      handleHoverLeave();
      motionDriverRef.current?.clearHover();
      pointerStateRef.current = null;
      activePointerIdRef.current = null;

      try {
        domElement.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    };

    const onPointerUp = (event: PointerEvent) => finishPointer(event, false);
    const onPointerCancel = (event: PointerEvent) => finishPointer(event, true);
    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        if (activePointerIdRef.current === null) {
          if (mouseHoverZoneIdRef.current) {
            handleHoverLeave();
            motionDriverRef.current?.clearHover();
            mouseHoverZoneIdRef.current = null;
          }
          return;
        }
        finishPointer(event, true);
      }
    };

    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('pointermove', onPointerMove, { passive: true });
    domElement.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('pointercancel', onPointerCancel);
    domElement.addEventListener('pointerleave', onPointerLeave);

    return () => {
      clearLongPressTimer();
      domElement.style.touchAction = previousTouchAction;
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('pointercancel', onPointerCancel);
      domElement.removeEventListener('pointerleave', onPointerLeave);
      handleHoverLeave();
      handleDragEnd();
      motionDriverRef.current?.clearHover();
      motionDriverRef.current?.endDrag();

      zoneIdsRef.current.forEach((zoneId) => unregisterHitZone(zoneId));
      zoneIdsRef.current = [];
      raycastManager.dispose();
      if (raycastManagerRef.current === raycastManager) {
        raycastManagerRef.current = null;
      }
      pointerStateRef.current = null;
      activePointerIdRef.current = null;
      mouseHoverZoneIdRef.current = null;
    };
  }, [
    applyTouchReaction,
    camera,
    gl,
    handleClick,
    handleDragEnd,
    handleDragMove,
    handleDragStart,
    handleHoverEnter,
    handleHoverLeave,
    handleHoverMove,
    handleLongPress,
    mesh,
    registerHitZone,
    unregisterHitZone,
  ]);

  useEffect(() => {
    applyMotion(stage, avatarAnimation);
  }, [applyMotion, avatarAnimation, stage]);

  useEffect(() => {
    managerRef.current?.setLipSync(lipSyncEnergy);
    expressionDriverRef.current?.setLipSyncEnergy(lipSyncEnergy);
  }, [lipSyncEnergy]);

  useEffect(() => {
    expressionDriverRef.current?.setBaseEmotion(normalizeExpressionEmotion(avatarEmotion), {
      intensity: 0.58,
    });
  }, [avatarEmotion]);

  useEffect(() => {
    expressionDriverRef.current?.setCurrentMotion(currentMotion);
  }, [currentMotion]);

  useFrame((_, delta) => {
    frameTokenRef.current += 1;
    raycastManagerRef.current?.setFrameToken(frameTokenRef.current);
    managerRef.current?.update(delta);
    expressionDriverRef.current?.update(delta);
    motionDriverRef.current?.update(delta);

    const now = performance.now();
    if (
      raycastManagerRef.current &&
      now - lastZoneSyncAtRef.current >= HIT_ZONE_SYNC_INTERVAL_MS
    ) {
      raycastManagerRef.current.getAllZoneBoundsSnapshot().forEach((zone) => {
        registerHitZone({
          id: zone.id,
          name: zone.name,
          bounds: {
            center: { x: zone.center.x, y: zone.center.y, z: zone.center.z },
            size: { x: zone.size.x, y: zone.size.y, z: zone.size.z },
          },
          priority: zone.priority,
          enabled: zone.enabled,
          allowedInteractions: zone.allowedInteractions,
        });
      });
      lastZoneSyncAtRef.current = now;
    }
  });

  return mesh ? <primitive object={mesh} dispose={null} /> : null;
}

export default MMDCharacter;

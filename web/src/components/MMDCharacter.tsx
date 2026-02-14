"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Animation, ModelStatus, MotionState } from '@/lib/api/types';
import { MMDAnimationManager } from '@/lib/mmd/mmd-animation';
import { loadPMX, loadVMDAnimation } from '@/lib/mmd/mmd-loader';
import { MotionCache } from '@/lib/mmd/motion-cache';
import { MotionManifestLoader } from '@/lib/mmd/motion-manifest';
import { MotionStateMachine } from '@/lib/mmd/motion-state-machine';
import { useAvatarStore } from '@/lib/store/avatarStore';
import { usePipelineStore, type PipelineStage } from '@/lib/store/pipelineStore';

const PRELOAD_STATES: MotionState[] = ['idle', 'listening', 'speaking', 'thinking', 'error'];
const SPEAKING_RANDOM_POOL_SIZE = 2;
const TALK8_MOTION_IDS = new Set(['phainon_bg_loop_chat_015', 'phainon_bg_loop_chat_016']);
const TALK8_INSTANT_FADE_DURATION = 0;

export interface MMDCharacterProps {
  modelPath: string;
  manifestPath: string;
  fadeDuration?: number;
  onLoadProgress?: (progress: number, message: string) => void;
  onStatusChange?: (status: ModelStatus, detail?: string) => void;
  onMotionChange?: (motionName: string) => void;
}

function toResourcePath(url: string): string {
  const normalized = url.replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex < 0) {
    return '/';
  }
  return normalized.slice(0, slashIndex + 1);
}

function disposeMesh(mesh: THREE.SkinnedMesh): void {
  mesh.traverse((child) => {
    const object = child as THREE.Mesh;
    object.geometry?.dispose();
    const material = object.material;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else {
      material?.dispose();
    }
  });
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

export function MMDCharacter({
  modelPath,
  manifestPath,
  fadeDuration,
  onLoadProgress,
  onStatusChange,
  onMotionChange,
}: MMDCharacterProps) {
  const [mesh, setMesh] = useState<THREE.SkinnedMesh | null>(null);

  const stage = usePipelineStore((state) => state.stage);
  const avatarAnimation = usePipelineStore((state) => state.avatarAnimation);
  const lipSyncEnergy = usePipelineStore((state) => state.lipSyncEnergy);

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
    },
    [onLoadProgress, setModelProgress]
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
    let cancelled = false;
    let localMesh: THREE.SkinnedMesh | null = null;
    let localManager: MMDAnimationManager | null = null;

    const run = async () => {
      try {
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
          onProgress: (progress) => emitProgress(10 + progress * 0.5, '加载 PMX 模型'),
        });
        meshRef.current = localMesh;
        meshBaseRotationYRef.current = localMesh.rotation.y;

        if (cancelled) {
          disposeMesh(localMesh);
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
        emitProgress(100, 'MMD 资源加载完成');
        emitStatus('ready');
        const { stage: currentStage, avatarAnimation: currentAnimation } = usePipelineStore.getState();
        applyMotion(currentStage, currentAnimation);
      } catch (error) {
        const message = normalizeError(error);
        emitProgress(0, `加载失败: ${message}`);
        emitStatus('error', message);
        const managerToDispose = localManager ?? managerRef.current;
        if (managerToDispose) {
          if (managerRef.current === managerToDispose) {
            managerRef.current = null;
          }
          managerToDispose.dispose();
          localManager = null;
        }
        if (localMesh) {
          disposeMesh(localMesh);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      const managerToDispose = localManager ?? managerRef.current;
      if (managerToDispose) {
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
      if (localMesh) {
        disposeMesh(localMesh);
      }
    };
  }, [applyMotion, emitProgress, emitStatus, fadeDuration, manifestPath, modelPath]);

  useEffect(() => {
    applyMotion(stage, avatarAnimation);
  }, [applyMotion, avatarAnimation, stage]);

  useEffect(() => {
    managerRef.current?.setLipSync(lipSyncEnergy);
  }, [lipSyncEnergy]);

  useFrame((_, delta) => {
    managerRef.current?.update(delta);
  });

  return mesh ? <primitive object={mesh} dispose={null} /> : null;
}

export default MMDCharacter;

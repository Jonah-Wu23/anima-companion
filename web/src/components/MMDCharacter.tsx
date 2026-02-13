"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ModelStatus, MotionState } from '@/lib/api/types';
import { MMDAnimationManager } from '@/lib/mmd/mmd-animation';
import { loadPMX, loadVMDAnimation } from '@/lib/mmd/mmd-loader';
import { MotionCache } from '@/lib/mmd/motion-cache';
import { MotionManifestLoader } from '@/lib/mmd/motion-manifest';
import { MotionStateMachine } from '@/lib/mmd/motion-state-machine';
import { useAvatarStore } from '@/lib/store/avatarStore';
import { usePipelineStore } from '@/lib/store/pipelineStore';

const PRELOAD_STATES: MotionState[] = ['idle', 'listening', 'speaking', 'thinking', 'error'];

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
    (nextStage = stage, nextAnimation = avatarAnimation) => {
      const manager = managerRef.current;
      if (!manager) {
        return;
      }

      const state = stateMachineRef.current.resolveMotion({
        stage: nextStage,
        avatarAnimation: nextAnimation,
      });
      const mappedMotion = motionMapRef.current[state] ?? motionMapRef.current.idle;
      if (!mappedMotion) {
        return;
      }

      manager.play(mappedMotion, fadeDuration);
      setCurrentMotion(mappedMotion);
      onMotionChange?.(mappedMotion);
    },
    [avatarAnimation, fadeDuration, onMotionChange, setCurrentMotion, stage]
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
        let loadedCount = 0;
        const totalStates = PRELOAD_STATES.length;

        for (const state of PRELOAD_STATES) {
          const candidate = manifestLoader.resolveBestCandidate(state, { includeFallback: true });
          if (!candidate) {
            continue;
          }

          const motionUrl = manifestLoader.resolvePublicPath(candidate.path);
          let clip = cacheRef.current.get(motionUrl);
          if (!clip) {
            clip = await loadVMDAnimation(motionUrl, localMesh, {
              onProgress: (progress) => {
                const base = 60 + (loadedCount / totalStates) * 35;
                const span = 35 / totalStates;
                emitProgress(base + (progress / 100) * span, `加载动作: ${candidate.asset_id}`);
              },
            });
            cacheRef.current.set(motionUrl, clip);
          }

          localManager.registerClip(candidate.asset_id, clip, {
            loop: state !== 'error',
          });
          resolvedMotionMap[state] = candidate.asset_id;
          loadedCount += 1;
        }

        motionMapRef.current = resolvedMotionMap;
        setMesh(localMesh);
        emitProgress(100, 'MMD 资源加载完成');
        emitStatus('ready');
        applyMotion();
      } catch (error) {
        const message = normalizeError(error);
        emitProgress(0, `加载失败: ${message}`);
        emitStatus('error', message);
        managerRef.current?.dispose();
        managerRef.current = null;
        if (localMesh) {
          disposeMesh(localMesh);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      managerRef.current?.dispose();
      managerRef.current = null;
      motionMapRef.current = {};
      if (localManager) {
        localManager.dispose();
      }
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

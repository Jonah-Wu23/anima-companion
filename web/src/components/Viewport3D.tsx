"use client";

import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useAvatarStore } from '@/lib/store/avatarStore';
import { usePipelineStore, type PipelineStage } from '@/lib/store/pipelineStore';
import { useSettingsStore } from '@/lib/store/settingsStore';

const EMOTION_COLORS: Record<string, string> = {
  neutral: '#FFD54F',
  happy: '#FFCA28',
  sad: '#90A4AE',
  angry: '#EF5350',
  surprised: '#4FC3F7',
};

const STAGE_COLORS: Partial<Record<PipelineStage, string>> = {
  recording: '#F87171',
  uploading: '#FBBF24',
  processing: '#81D4FA',
  speaking: '#FDBA74',
  error: '#EF4444',
};

function getTargetColor(stage: PipelineStage, emotion: string): string {
  return STAGE_COLORS[stage] ?? EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral;
}

function SunnyBubble() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);
  const scaleTargetRef = useRef(new THREE.Vector3(1, 1, 1));
  const colorTargetRef = useRef(new THREE.Color(EMOTION_COLORS.neutral));

  useFrame((state, delta) => {
    if (!meshRef.current || !materialRef.current) return;

    const { stage, lipSyncEnergy } = usePipelineStore.getState();
    const { emotion } = useAvatarStore.getState();
    const time = state.clock.elapsedTime;

    const floatY = reducedMotion ? 0 : Math.sin(time * 1.5) * 0.1;
    meshRef.current.position.y = floatY;
    meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, 0, 0.2);

    if (stage === 'recording') {
      const pulse = reducedMotion ? 0 : Math.sin(time * 8) * 0.04;
      scaleTargetRef.current.set(1.05 + pulse, 1.05 + pulse, 1.05 + pulse);
    } else if (stage === 'speaking' || lipSyncEnergy > 0.01) {
      const effectiveEnergy = reducedMotion ? Math.min(lipSyncEnergy, 0.2) : lipSyncEnergy;
      const stretch = 1 + effectiveEnergy * 0.3;
      const squash = 1 - effectiveEnergy * 0.1;
      scaleTargetRef.current.set(squash, stretch, squash);
    } else if (stage === 'error') {
      const shake = reducedMotion ? 0 : Math.sin(time * 24) * 0.03;
      meshRef.current.position.x = shake;
      scaleTargetRef.current.set(1.03, 1.03, 1.03);
    } else {
      scaleTargetRef.current.set(1, 1, 1);
    }
    meshRef.current.scale.lerp(scaleTargetRef.current, reducedMotion ? 0.1 : 0.2);

    if (stage === 'processing' || stage === 'uploading') {
      meshRef.current.rotation.y += delta * (reducedMotion ? 1.2 : 5.0);
      meshRef.current.rotation.z = reducedMotion ? 0 : Math.sin(time * 5) * 0.1;
    } else if (stage === 'error') {
      meshRef.current.rotation.y += delta * 1.0;
      meshRef.current.rotation.z = reducedMotion ? 0 : Math.sin(time * 16) * 0.12;
    } else {
      meshRef.current.rotation.y += delta * (reducedMotion ? 0.15 : 0.5);
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, 0.1);
    }

    colorTargetRef.current.set(getTargetColor(stage, emotion));
    if (materialRef.current.color) {
      materialRef.current.color.lerp(colorTargetRef.current, reducedMotion ? 0.12 : 0.05);
    }
    if (materialRef.current.emissive) {
      materialRef.current.emissive.lerp(colorTargetRef.current, reducedMotion ? 0.08 : 0.03);
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} castShadow receiveShadow>
      <sphereGeometry args={[1, 64, 64]} />
      <meshPhysicalMaterial
        ref={materialRef}
        color="#FFFDF4"
        roughness={0.28}
        metalness={0.05}
        clearcoat={0.9}
        clearcoatRoughness={0.18}
        emissive="#FFD54F"
        emissiveIntensity={0.2}
      />
    </mesh>
  );
}

function Lighting() {
  return (
    <>
      <spotLight
        position={[5, 5, 5]}
        angle={0.5}
        penumbra={1}
        intensity={1.7}
        color="#FFF8E1"
      />
      
      <pointLight
        position={[-5, 0, 5]}
        intensity={1.0}
        color="#E1F5FE"
      />
      
      <spotLight
        position={[0, 5, -5]}
        intensity={1.4}
        color="#FFFFFF"
      />
      
      <ambientLight intensity={0.4} />
    </>
  );
}

export default function Viewport3D() {
  const setSceneStatus = useAvatarStore((state) => state.setSceneStatus);

  useEffect(() => {
    setSceneStatus('ready');
    return () => setSceneStatus('loading');
  }, [setSceneStatus]);

  return (
    <div className="w-full h-full min-h-[300px] relative">
      <Canvas
        fallback={
          <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
            3D 初始化失败，请刷新重试
          </div>
        }
        dpr={[1, 2]}
        gl={{ 
            alpha: true,
            antialias: false,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.0
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 4]} fov={45} />
        <color attach="background" args={['#EAF5FF']} />
        <fog attach="fog" args={['#FDFBF7', 8, 25]} />
        
        <Lighting />
        
        <group position={[0, 0.5, 0]}>
             <SunnyBubble />
        </group>
      </Canvas>
    </div>
  );
}

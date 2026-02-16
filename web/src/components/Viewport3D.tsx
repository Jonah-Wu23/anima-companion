"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, useGLTF, Sky, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, DepthOfField, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import MMDCharacter from '@/components/MMDCharacter';
import ModelLoadingIndicator from '@/components/ModelLoadingIndicator';
import type { ModelStatus } from '@/lib/api/types';
import { useAvatarStore } from '@/lib/store/avatarStore';
import { usePipelineStore, type PipelineStage } from '@/lib/store/pipelineStore';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { resolveModelPmxPathById } from '@/lib/wardrobe/model-registry';
import { useWardrobeStore } from '@/lib/store/wardrobeStore';

const DEFAULT_MANIFEST_PATH = '/api/local-files/configs/motions/phainon-motion-manifest.json';

// Blender 相机参数（Z-up, XYZ 欧拉）
const BLENDER_CAMERA_POSITION: [number, number, number] = [-0.004086, -5.34387, 1.06392];
const BLENDER_CAMERA_ROTATION_DEG: [number, number, number] = [89.0057, -0.00001, -0.533334];
const CAMERA_VERTICAL_OFFSET = 1.1;
const CAMERA_FORWARD_OFFSET = 0.3;
const TALK8_CAMERA_FORWARD_EXTRA_OFFSET = 0.5;
const TALK8_MOTION_IDS = new Set(['phainon_bg_loop_chat_015', 'phainon_bg_loop_chat_016']);

// 坐标系转换：Blender(Z-up) -> Three(Y-up)
const BLENDER_TO_THREE_BASIS = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ')
);

const blenderEuler = new THREE.Euler(
  THREE.MathUtils.degToRad(BLENDER_CAMERA_ROTATION_DEG[0]),
  THREE.MathUtils.degToRad(BLENDER_CAMERA_ROTATION_DEG[1]),
  THREE.MathUtils.degToRad(BLENDER_CAMERA_ROTATION_DEG[2]),
  'XYZ'
);
const CAMERA_QUATERNION = BLENDER_TO_THREE_BASIS
  .clone()
  .multiply(new THREE.Quaternion().setFromEuler(blenderEuler))
  .normalize();
const CAMERA_BASE_POSITION = new THREE.Vector3(
  BLENDER_CAMERA_POSITION[0],
  BLENDER_CAMERA_POSITION[2] + CAMERA_VERTICAL_OFFSET,
  -BLENDER_CAMERA_POSITION[1]
);
const CAMERA_FORWARD = new THREE.Vector3(0, 0, -1).applyQuaternion(CAMERA_QUATERNION);
const CAMERA_POSITION: [number, number, number] = [
  CAMERA_BASE_POSITION.x + CAMERA_FORWARD.x * CAMERA_FORWARD_OFFSET,
  CAMERA_BASE_POSITION.y + CAMERA_FORWARD.y * CAMERA_FORWARD_OFFSET,
  CAMERA_BASE_POSITION.z + CAMERA_FORWARD.z * CAMERA_FORWARD_OFFSET,
];

const CAMERA_FOCAL_LENGTH_MM = 50;
const CAMERA_SENSOR_MM = 36;
const MMD_MODEL_SCALE = 0.12;
const ROOM_SCENE_SCALE = 1;
const ROOM_SCENE_BACKWARD_OFFSET = 2.5;
const ROOM_SCENE_PATH = '/assets/scenes/scene.glb';

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
    materialRef.current.color.lerp(colorTargetRef.current, reducedMotion ? 0.12 : 0.05);
    materialRef.current.emissive.lerp(colorTargetRef.current, reducedMotion ? 0.08 : 0.03);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <sphereGeometry args={[1, 32, 32]} />
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

// 午后阳光氛围灯光：温暖、通透、田园感
function SunnyAfternoonLighting() {
  return (
    <>
      {/* 基础环境光：暖调，模拟室内漫反射 */}
      <ambientLight intensity={0.42} color="#FFF8E7" />
      
      {/* 主光源：午后斜阳，暖金色，从窗户方向射入 */}
      <directionalLight 
        position={[-8, 6, 4]} 
        intensity={1.2} 
        color="#FFE4B5"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      
      {/* 补光：柔化阴影，冷调平衡 */}
      <directionalLight 
        position={[4, 2, -6]} 
        intensity={0.28} 
        color="#E8F4FF" 
      />

      {/* 半球光：天空蓝到暖地的渐变 */}
      <hemisphereLight 
        intensity={0.35} 
        groundColor="#F5E6D3" 
        color="#87CEEB" 
      />
      
      {/* 点光源：模拟室内温馨感 */}
      <pointLight
        position={[2, 3, 2]}
        intensity={0.3}
        color="#FFDAB9"
        distance={8}
      />
    </>
  );
}

// 蓝天白云天空盒
function BlueSky() {
  return (
    <Sky
      distance={450000}
      sunPosition={[-8, 4, 4]}
      inclination={0.49}
      azimuth={0.25}
      mieCoefficient={0.005}
      mieDirectionalG={0.8}
      rayleigh={0.8}
      turbidity={3}
    />
  );
}

function RoomScene() {
  const { scene } = useGLTF(ROOM_SCENE_PATH);
  return (
    <>
      {/* 窗外蓝天白云：天花板会遮挡顶部，窗外可见蓝天 */}
      <BlueSky />
      <primitive
        object={scene}
        scale={[ROOM_SCENE_SCALE, ROOM_SCENE_SCALE, ROOM_SCENE_SCALE]}
        rotation={[0, -3 * Math.PI / 4, 0]}
        position={[0, 0, -ROOM_SCENE_BACKWARD_OFFSET]}
      />
    </>
  );
}

function CameraPoseController() {
  const currentMotion = useAvatarStore((state) => state.currentMotion);
  const targetPositionRef = useRef(
    new THREE.Vector3(CAMERA_POSITION[0], CAMERA_POSITION[1], CAMERA_POSITION[2])
  );

  useEffect(() => {
    const forwardOffset = TALK8_MOTION_IDS.has(currentMotion)
      ? CAMERA_FORWARD_OFFSET + TALK8_CAMERA_FORWARD_EXTRA_OFFSET
      : CAMERA_FORWARD_OFFSET;
    targetPositionRef.current
      .copy(CAMERA_BASE_POSITION)
      .addScaledVector(CAMERA_FORWARD, forwardOffset);
  }, [currentMotion]);

  useFrame(({ camera }) => {
    camera.position.copy(targetPositionRef.current);
    camera.quaternion.copy(CAMERA_QUATERNION);
  });

  return null;
}

export default function Viewport3D() {
  const modelStatus = useAvatarStore((state) => state.modelStatus);
  const modelProgress = useAvatarStore((state) => state.modelProgress);
  const setSceneStatus = useAvatarStore((state) => state.setSceneStatus);
  const setModelStatus = useAvatarStore((state) => state.setModelStatus);
  const setCurrentMotion = useAvatarStore((state) => state.setCurrentMotion);
  const setModelProgress = useAvatarStore((state) => state.setModelProgress);
  const currentModelId = useWardrobeStore((state) => state.currentModelId);
  const setWardrobeStatus = useWardrobeStore((state) => state.setStatus);
  const setWardrobeLoadingProgress = useWardrobeStore((state) => state.setLoadingProgress);
  const setWardrobeErrorMessage = useWardrobeStore((state) => state.setErrorMessage);

  const activeModelPath = useMemo(() => resolveModelPmxPathById(currentModelId), [currentModelId]);

  useEffect(() => {
    setSceneStatus('loading');
    setModelStatus('loading');
    setModelProgress(0);
    return () => setSceneStatus('loading');
  }, [setModelProgress, setModelStatus, setSceneStatus]);

  const handleStatusChange = useCallback(
    (status: ModelStatus, detail?: string) => {
      setModelStatus(status);
      if (status === 'loading') {
        setWardrobeStatus('switching');
        setWardrobeErrorMessage(null);
        return;
      }
      if (status === 'ready') {
        setWardrobeStatus('idle');
        setWardrobeLoadingProgress(100);
        setWardrobeErrorMessage(null);
        return;
      }
      setWardrobeStatus('error');
      setWardrobeErrorMessage(detail ?? '模型加载失败');
    },
    [setModelStatus, setWardrobeErrorMessage, setWardrobeLoadingProgress, setWardrobeStatus]
  );

  const handleProgressChange = useCallback(
    (progress: number) => {
      setModelProgress(progress);
      setWardrobeLoadingProgress(progress);
    },
    [setModelProgress, setWardrobeLoadingProgress]
  );

  const shouldRenderMMD = modelStatus !== 'error';
  const showBubbleFallback = modelStatus !== 'ready';

  return (
    <div className="relative h-full min-h-[300px] w-full">
      <Canvas
        fallback={
          <div className="flex h-full w-full flex-col items-center justify-center text-slate-500">
            <span className="text-2xl mb-2">😢</span>
            <span className="text-sm">3D 初始化失败，请刷新重试</span>
          </div>
        }
        dpr={[1, 1.5]}
        gl={{
          alpha: true,
          antialias: false,
          // 相册截图依赖 canvas.toBlob，需保留绘制缓冲避免黑帧
          preserveDrawingBuffer: true,
          // 使用 NoToneMapping 避免颜色压缩，更好地还原 MMD 贴图
          toneMapping: THREE.NoToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
          powerPreference: 'high-performance',
        }}
      >
        <PerspectiveCamera
          makeDefault
          position={CAMERA_POSITION}
          near={0.1}
          far={1000}
          onUpdate={(camera) => {
            camera.quaternion.copy(CAMERA_QUATERNION);
            camera.filmGauge = CAMERA_SENSOR_MM;
            camera.setFocalLength(CAMERA_FOCAL_LENGTH_MM);
            camera.updateProjectionMatrix();
          }}
        />
        <CameraPoseController />
        {/* 背景：与室内墙壁颜色相近的浅灰色，融入房间 */}
        <color attach="background" args={['#c5c8cc']} />
        {/* 雾效：淡蓝雾气，增强空气感 */}
        <fog attach="fog" args={['#B0D9F0', 12, 35]} />
        
        {/* 午后阳光氛围灯光 */}
        <SunnyAfternoonLighting />

        <Suspense fallback={null}>
          <RoomScene />
        </Suspense>

        <group position={[0, 0.5, 0]}>
          {shouldRenderMMD && (
            <group visible={modelStatus === 'ready'} scale={[MMD_MODEL_SCALE, MMD_MODEL_SCALE, MMD_MODEL_SCALE]}>
              <MMDCharacter
                modelId={currentModelId}
                modelPath={activeModelPath}
                manifestPath={DEFAULT_MANIFEST_PATH}
                onStatusChange={handleStatusChange}
                onLoadProgress={handleProgressChange}
                onMotionChange={setCurrentMotion}
              />
            </group>
          )}
          {showBubbleFallback && <SunnyBubble />}
        </group>
        
        {/* 后期效果：温暖辉光 + 边缘暗角（已移除景深） */}
        <EffectComposer>
          {/* 温暖辉光：模拟午后阳光的光晕感 */}
          <Bloom 
            intensity={0.4} 
            luminanceThreshold={0.65} 
            luminanceSmoothing={0.3}
            mipmapBlur
          />
          {/* 边缘暗角：聚焦视线在角色 */}
          <Vignette 
            offset={0.3} 
            darkness={0.4} 
            eskil={false} 
          />
        </EffectComposer>
      </Canvas>

      {modelStatus === 'loading' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-end p-3">
          <ModelLoadingIndicator progress={modelProgress} statusText="MMD 角色加载中" />
        </div>
      )}
    </div>
  );
}

useGLTF.preload(ROOM_SCENE_PATH);

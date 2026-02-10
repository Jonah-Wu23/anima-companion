"use client";

import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Sphere } from "@react-three/drei";
import { Color, Mesh, MeshStandardMaterial } from "three";
import { usePipelineStore } from "@/lib/store/pipelineStore";

function Avatar() {
  const meshRef = useRef<Mesh>(null);
  const { stage, lipSyncEnergy } = usePipelineStore();

  const colors = useMemo(
    () => ({
      idle: new Color("#60A5FA"),
      recording: new Color("#EF4444"),
      uploading: new Color("#F59E0B"),
      processing: new Color("#8B5CF6"),
      speaking: new Color("#10B981"),
      error: new Color("#EF4444"),
    }),
    [],
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const time = state.clock.getElapsedTime();
    const material = mesh.material as MeshStandardMaterial;
    const targetColor = colors[stage] ?? colors.idle;
    material.color.lerp(targetColor, delta * 5);

    switch (stage) {
      case "recording": {
        const scale = 1.45 + Math.sin(time * 8) * 0.1;
        mesh.scale.setScalar(scale);
        mesh.rotation.z = Math.sin(time * 5) * 0.05;
        mesh.position.y = 0;
        break;
      }
      case "uploading":
      case "processing": {
        mesh.rotation.y += delta * 4.5;
        mesh.rotation.z = Math.sin(time * 3) * 0.2;
        const scale = 1.35 + Math.sin(time * 5) * 0.05;
        mesh.scale.setScalar(scale);
        mesh.position.y = 0;
        break;
      }
      case "speaking": {
        const bounce = Math.abs(Math.sin(time * 10)) * 0.08;
        const energy = Math.min(Math.max(lipSyncEnergy, 0), 1) * 0.15;
        const scale = 1.42 + Math.sin(time * 15) * 0.06 + energy;
        mesh.scale.set(scale, scale * 0.94, scale);
        mesh.position.y = bounce;
        mesh.rotation.y += delta * 1.2;
        break;
      }
      case "error": {
        const scale = 1.42 + Math.sin(time * 14) * 0.08;
        mesh.scale.setScalar(scale);
        mesh.rotation.z = Math.sin(time * 16) * 0.25;
        mesh.position.y = 0;
        break;
      }
      case "idle":
      default: {
        const scale = 1.38 + Math.sin(time * 2) * 0.05;
        mesh.scale.setScalar(scale);
        mesh.rotation.y += delta * 0.25;
        mesh.rotation.z = 0;
        mesh.position.y = 0;
      }
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.45}>
      <Sphere ref={meshRef} args={[1, 64, 64]}>
        <meshStandardMaterial roughness={0.2} metalness={0.45} emissive={new Color("#000000")} emissiveIntensity={0.1} />
      </Sphere>
    </Float>
  );
}

export function Viewport3D() {
  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <ambientLight intensity={0.62} />
        <directionalLight position={[5, 10, 5]} intensity={1} />
        <pointLight position={[-5, -5, -5]} intensity={0.5} color="#ffffff" />
        <Avatar />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}

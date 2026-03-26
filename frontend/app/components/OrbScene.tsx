"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { motion } from "framer-motion";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { OrbMode } from "./types";

interface OrbSceneProps {
  mode: OrbMode;
  contextRatio: number;
  reducedMotion: boolean;
}

const ORB_COLORS: Record<OrbMode, { primary: string; secondary: string }> = {
  idle: { primary: "#7a73e8", secondary: "#dce1ff" },
  thinking: { primary: "#8a6fff", secondary: "#f0ebff" },
  answering: { primary: "#72b7ff", secondary: "#ffffff" },
  paused: { primary: "#8e7ce4", secondary: "#d9d8ff" },
  error: { primary: "#9d4061", secondary: "#ffc8dd" },
};

const VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float uTime;
  uniform float uEnergy;

  void main() {
    vUv = uv;
    vNormal = normal;

    float waveA = sin(position.y * 3.8 + uTime * 0.85) * 0.04 * uEnergy;
    float waveB = sin((position.x + position.z) * 4.2 - uTime * 0.55) * 0.025 * uEnergy;
    vec3 displaced = position + normal * (waveA + waveB);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float uTime;
  uniform float uBrightness;
  uniform float uEnergy;
  uniform float uError;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;

  void main() {
    vec3 normal = normalize(vNormal);
    float fresnel = pow(1.1 - abs(dot(normal, vec3(0.0, 0.0, 1.0))), 2.6);
    float vertical = smoothstep(0.0, 1.0, vUv.y);
    float shimmer = 0.5 + 0.5 * sin(uTime * 0.7 + vUv.y * 5.0);

    vec3 base = mix(uPrimary, uSecondary, clamp(vertical * 0.55 + fresnel * 0.75, 0.0, 1.0));
    vec3 glow = base * (0.72 + uBrightness * 0.24 + shimmer * 0.06 * uEnergy);
    vec3 errorTint = mix(glow, vec3(0.86, 0.32, 0.46), uError * 0.72);

    float alpha = clamp(0.86 + fresnel * 0.12, 0.0, 1.0);
    gl_FragColor = vec4(errorTint, alpha);
  }
`;

function OrbCore({
  mode,
  contextRatio,
  reducedMotion,
}: Pick<OrbSceneProps, "mode" | "contextRatio" | "reducedMotion">) {
  const meshRef = useRef<THREE.Mesh>(null);
  const floorRef = useRef<THREE.Mesh>(null);
  const reflectionRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0.52 },
      uBrightness: { value: 0.88 },
      uError: { value: 0 },
      uPrimary: { value: new THREE.Color(ORB_COLORS.idle.primary) },
      uSecondary: { value: new THREE.Color(ORB_COLORS.idle.secondary) },
    }),
    []
  );

  useFrame((state, delta) => {
    const motionStep = reducedMotion ? delta * 0.18 : delta;
    const idleWave = reducedMotion
      ? 0.01
      : Math.sin(state.clock.elapsedTime * 0.52) * 0.03;
    const shimmerWave = reducedMotion
      ? 0.008
      : Math.cos(state.clock.elapsedTime * 0.34) * 0.022;
    const colors = ORB_COLORS[mode];

    const targetEnergy =
      mode === "thinking"
        ? 0.82
        : mode === "answering"
          ? 1.02
          : mode === "paused"
            ? 0.46
            : mode === "error"
              ? 0.34
              : 0.58;
    const targetBrightness =
      mode === "thinking"
        ? 1
        : mode === "answering"
          ? 1.1
          : mode === "paused"
            ? 0.8
            : mode === "error"
              ? 0.56
              : 0.9;

    uniforms.uTime.value += motionStep;
    uniforms.uEnergy.value = THREE.MathUtils.lerp(
      uniforms.uEnergy.value,
      targetEnergy + contextRatio * 0.28 + idleWave,
      0.08
    );
    uniforms.uBrightness.value = THREE.MathUtils.lerp(
      uniforms.uBrightness.value,
      targetBrightness + shimmerWave,
      0.08
    );
    uniforms.uError.value = THREE.MathUtils.lerp(
      uniforms.uError.value,
      mode === "error" ? 1 : 0,
      0.12
    );
    uniforms.uPrimary.value.lerp(new THREE.Color(colors.primary), 0.08);
    uniforms.uSecondary.value.lerp(new THREE.Color(colors.secondary), 0.08);

    if (meshRef.current) {
      const targetScale =
        mode === "thinking"
          ? 1.03
          : mode === "answering"
            ? 1.06
            : mode === "paused"
              ? 0.985
              : mode === "error"
                ? 0.97
                : 1;

      meshRef.current.rotation.y += delta * (reducedMotion ? 0.03 : 0.08);
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.18) * 0.05;
      meshRef.current.position.y = idleWave * 0.8;
      meshRef.current.scale.lerp(
        new THREE.Vector3(
          targetScale + idleWave * 0.25,
          targetScale + shimmerWave * 0.18,
          targetScale + idleWave * 0.25
        ),
        0.08
      );
    }

    if (floorRef.current) {
      const material = floorRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.028 + Math.abs(shimmerWave) * 0.02 + contextRatio * 0.012;
    }

    if (reflectionRef.current) {
      reflectionRef.current.position.y = -1.3 - idleWave * 0.12;
      reflectionRef.current.scale.set(
        1 + Math.abs(idleWave) * 0.04,
        0.7 + Math.abs(shimmerWave) * 0.08,
        1
      );
      const material = reflectionRef.current.material as THREE.MeshBasicMaterial;
      material.opacity =
        (mode === "answering" ? 0.12 : mode === "thinking" ? 0.09 : 0.05) +
        uniforms.uBrightness.value * 0.025 +
        contextRatio * 0.018;
      material.color.lerp(new THREE.Color(colors.secondary), 0.08);
    }
  });

  return (
    <>
      <group position={[0, 2.95, 0]}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[2.18, 20]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            uniforms={uniforms}
            vertexShader={VERTEX_SHADER}
            fragmentShader={FRAGMENT_SHADER}
          />
        </mesh>
      </group>

      <mesh
        ref={reflectionRef}
        position={[0, -1.3, -0.06]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[3.25, 72]} />
        <meshBasicMaterial color="#d9e0ff" transparent opacity={0.08} />
      </mesh>

      <mesh ref={floorRef} position={[0, -1.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9.2, 96]} />
        <meshBasicMaterial color="#030409" transparent opacity={0.035} />
      </mesh>
    </>
  );
}

export function OrbScene({
  mode,
  contextRatio,
  reducedMotion,
}: OrbSceneProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-8%,rgba(135,122,255,0.22),transparent_28%),linear-gradient(to_bottom,rgba(0,0,0,0)_6%,rgba(4,6,10,0.04)_34%,rgba(3,5,9,0.22)_100%)]"
        animate={
          reducedMotion
            ? { opacity: 1 }
            : { opacity: [0.88, 1, 0.9], scale: [1, 1.015, 1] }
        }
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute left-1/2 top-[12%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(220,225,255,0.18),rgba(108,118,190,0.08),transparent_72%)] blur-[92px]"
        animate={
          reducedMotion
            ? { opacity: 0.5 }
            : { opacity: [0.34, 0.54, 0.38], scale: [0.96, 1.04, 0.98] }
        }
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="absolute inset-x-0 top-[28vh] h-px bg-[linear-gradient(to_right,transparent,rgba(187,198,229,0.34),transparent)]" />

      <motion.div
        className="absolute inset-x-[-8%] top-[28vh] bottom-[-18vh]"
        animate={
          reducedMotion
            ? { opacity: 0.96 }
            : { opacity: [0.92, 1, 0.94] }
        }
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      >
        <div
          className="h-full w-full"
          style={{
            clipPath: "polygon(28% 0%, 72% 0%, 100% 100%, 0% 100%)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 8%, rgba(8,10,16,0.32) 26%, rgba(5,7,12,0.82) 56%, rgba(1,2,5,1) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 120px 240px rgba(255,255,255,0.018), 0 -40px 140px rgba(0,0,0,0.56)",
          }}
        />
      </motion.div>

      <div
        className="absolute left-[18%] top-[28vh] bottom-[-8vh] w-[2px] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.36),rgba(255,255,255,0.08),transparent)] opacity-72"
        style={{ transform: "skewX(24deg)", transformOrigin: "top" }}
      />
      <div
        className="absolute right-[18%] top-[28vh] bottom-[-8vh] w-[2px] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.36),rgba(255,255,255,0.08),transparent)] opacity-72"
        style={{ transform: "skewX(-24deg)", transformOrigin: "top" }}
      />
      <div
        className="absolute left-[30%] top-[28vh] bottom-[4vh] w-px bg-[linear-gradient(to_bottom,rgba(186,198,255,0.18),rgba(255,255,255,0.02),transparent)] opacity-55"
        style={{ transform: "skewX(16deg)", transformOrigin: "top" }}
      />
      <div
        className="absolute right-[30%] top-[28vh] bottom-[4vh] w-px bg-[linear-gradient(to_bottom,rgba(186,198,255,0.18),rgba(255,255,255,0.02),transparent)] opacity-55"
        style={{ transform: "skewX(-16deg)", transformOrigin: "top" }}
      />

      <motion.div
        className="absolute inset-x-[12%] top-[30vh] h-24 rounded-[50%] bg-[radial-gradient(circle,rgba(255,255,255,0.06),rgba(182,194,255,0.015),transparent_74%)] blur-3xl"
        animate={
          reducedMotion
            ? { opacity: 0.3 }
            : { opacity: [0.16, 0.34, 0.18], scaleX: [0.94, 1.04, 0.96] }
        }
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-x-[18%] bottom-[6vh] h-20 rounded-[50%] bg-[radial-gradient(circle,rgba(255,255,255,0.09),rgba(140,156,255,0.028),transparent_72%)] blur-[42px]"
        animate={
          reducedMotion
            ? { opacity: 0.34 }
            : { opacity: [0.2, 0.38, 0.22], scaleX: [0.94, 1.08, 0.96] }
        }
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      <Canvas
        camera={{ position: [0, 0, 6.4], fov: 40 }}
        dpr={[1, 1.6]}
        className="absolute inset-0"
      >
        <ambientLight intensity={0.28} color="#dfe5ff" />
        <directionalLight position={[0.8, 4.2, 3.6]} intensity={1.28} color="#f3f6ff" />
        <pointLight
          position={[0, 2.4, 2.8]}
          intensity={0.3}
          distance={8}
          color="#89a6ff"
        />
        <OrbCore
          mode={mode}
          contextRatio={contextRatio}
          reducedMotion={reducedMotion}
        />
      </Canvas>
    </div>
  );
}

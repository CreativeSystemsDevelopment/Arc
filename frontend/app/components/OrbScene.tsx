"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { OrbMode, SubagentEcho } from "./types";

interface OrbSceneProps {
  mode: OrbMode;
  contextRatio: number;
  echoes: SubagentEcho[];
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
      reflectionRef.current.position.y = -3.1 - idleWave * 0.14;
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
    <group position={[0, 0.2, 0]}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.56, 20]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          uniforms={uniforms}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
        />
      </mesh>

      <mesh
        ref={reflectionRef}
        position={[0, -3.1, -0.06]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[1.92, 64]} />
        <meshBasicMaterial color="#d9e0ff" transparent opacity={0.08} />
      </mesh>

      <mesh ref={floorRef} position={[0, -3.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.6, 64]} />
        <meshBasicMaterial color="#05070d" transparent opacity={0.03} />
      </mesh>
    </group>
  );
}

function modeLabel(mode: OrbMode) {
  switch (mode) {
    case "thinking":
      return "Thinking";
    case "answering":
      return "Responding";
    case "paused":
      return "Paused";
    case "error":
      return "Needs attention";
    default:
      return "Ready";
  }
}

export function OrbScene({
  mode,
  contextRatio,
  echoes,
  reducedMotion,
}: OrbSceneProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(135,122,255,0.16),transparent_30%),linear-gradient(to_bottom,rgba(0,0,0,0)_8%,rgba(4,6,10,0.08)_58%,rgba(3,5,9,0.34)_100%)]"
        animate={
          reducedMotion
            ? { opacity: 1 }
            : { opacity: [0.88, 1, 0.9], scale: [1, 1.015, 1] }
        }
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute left-1/2 top-[34%] h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(220,225,255,0.16),rgba(108,118,190,0.08),transparent_72%)] blur-[72px]"
        animate={
          reducedMotion
            ? { opacity: 0.5 }
            : { opacity: [0.34, 0.54, 0.38], scale: [0.96, 1.04, 0.98] }
        }
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="absolute left-1/2 top-[59%] h-px w-[min(42rem,72vw)] -translate-x-1/2 bg-[linear-gradient(to_right,transparent,rgba(187,198,229,0.24),transparent)]" />

      <Canvas
        camera={{ position: [0, 0, 5.6], fov: 36 }}
        dpr={[1, 1.6]}
        className="absolute inset-0"
      >
        <ambientLight intensity={0.28} color="#dfe5ff" />
        <directionalLight position={[0.8, 3.2, 3.6]} intensity={1.2} color="#f3f6ff" />
        <pointLight
          position={[0, 1.1, 2.4]}
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

      <div className="absolute inset-x-0 bottom-8 flex justify-center">
        <div className="rounded-full border border-white/8 bg-black/20 px-4 py-2 text-[11px] uppercase tracking-[0.34em] text-white/46 backdrop-blur-xl">
          {modeLabel(mode)} · {Math.round(contextRatio * 100)}% context
        </div>
      </div>

      <AnimatePresence>
        {echoes.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute inset-x-0 bottom-24 flex justify-center px-4"
          >
            <div className="flex flex-wrap justify-center gap-3">
              {echoes.slice(-3).map((echo) => (
                <motion.div
                  key={echo.id}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{
                    opacity: echo.status === "completed" ? 0.62 : 0.92,
                    scale: echo.status === "running" ? 1 : 0.98,
                  }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="rounded-full border border-white/10 bg-black/28 px-3 py-2 text-center backdrop-blur-xl"
                >
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/38">
                    {echo.status}
                  </div>
                  <div className="mt-1 text-[11px] font-medium tracking-[0.12em] text-white/78">
                    {echo.name}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

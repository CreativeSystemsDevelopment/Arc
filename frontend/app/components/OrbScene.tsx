"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { HealthPayload, OrbMode, SubagentEcho, UiIdentity } from "./types";

interface OrbSceneProps {
  mode: OrbMode;
  identity: UiIdentity | null;
  contextRatio: number;
  health: HealthPayload | null;
  echoes: SubagentEcho[];
  reducedMotion: boolean;
}

const ORB_COLORS: Record<OrbMode, { primary: string; secondary: string }> = {
  idle: { primary: "#766fe8", secondary: "#cfd8ff" },
  thinking: { primary: "#7a63ff", secondary: "#f0e6ff" },
  answering: { primary: "#6bb8ff", secondary: "#ffffff" },
  paused: { primary: "#9b82f7", secondary: "#d7d4ff" },
  error: { primary: "#9a3358", secondary: "#ffb8d5" },
};

const CHILD_ORBIT_OFFSETS = [
  { x: -190, y: 104 },
  { x: 172, y: 126 },
  { x: -54, y: 178 },
];

const VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float uTime;
  uniform float uEnergy;

  void main() {
    vUv = uv;
    vNormal = normal;

    float waveA = sin(position.y * 5.8 + uTime * 1.2) * 0.08 * uEnergy;
    float waveB = sin(position.x * 4.2 - uTime * 0.85) * 0.05 * uEnergy;
    float waveC = sin((position.z + position.x) * 7.0 + uTime * 1.6) * 0.03;
    vec3 displaced = position + normal * (waveA + waveB + waveC);

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
    float fresnel = pow(1.15 - abs(dot(normal, vec3(0.0, 0.0, 1.0))), 2.4);
    float banding = 0.5 + 0.5 * sin((vUv.y * 18.0) + uTime * 1.8);
    float ripple = 0.5 + 0.5 * sin((vUv.x * 26.0) - uTime * 1.3);

    vec3 base = mix(uPrimary, uSecondary, clamp(fresnel * 0.8 + banding * 0.16, 0.0, 1.0));
    vec3 energized = base * (0.76 + (uBrightness * 0.25) + (ripple * 0.15 * uEnergy));
    vec3 errorTint = mix(energized, vec3(0.88, 0.28, 0.44), uError * 0.75);

    float alpha = clamp(0.74 + fresnel * 0.18 + banding * 0.08, 0.0, 1.0);
    gl_FragColor = vec4(errorTint, alpha);
  }
`;

function OrbCore({
  mode,
  contextRatio,
  reducedMotion,
}: Pick<OrbSceneProps, "mode" | "contextRatio" | "reducedMotion">) {
  const meshRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const floorRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0.56 },
      uBrightness: { value: 0.9 },
      uError: { value: 0 },
      uPrimary: { value: new THREE.Color(ORB_COLORS.idle.primary) },
      uSecondary: { value: new THREE.Color(ORB_COLORS.idle.secondary) },
    }),
    []
  );

  useFrame((state, delta) => {
    const step = reducedMotion ? delta * 0.2 : delta;
    uniforms.uTime.value += step;

    const colors = ORB_COLORS[mode];
    const targetEnergy =
      mode === "thinking"
        ? 0.88
        : mode === "answering"
          ? 1.1
          : mode === "paused"
            ? 0.5
            : mode === "error"
              ? 0.34
              : 0.62;
    const targetBrightness =
      mode === "thinking"
        ? 1.06
        : mode === "answering"
          ? 1.18
          : mode === "paused"
            ? 0.82
            : mode === "error"
              ? 0.58
              : 0.92;

    uniforms.uEnergy.value = THREE.MathUtils.lerp(
      uniforms.uEnergy.value,
      targetEnergy + contextRatio * 0.35,
      0.08
    );
    uniforms.uBrightness.value = THREE.MathUtils.lerp(
      uniforms.uBrightness.value,
      targetBrightness,
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
          ? 1.04
          : mode === "answering"
            ? 1.08
            : mode === "paused"
              ? 0.985
              : mode === "error"
                ? 0.96
                : 1;

      meshRef.current.rotation.y += delta * (reducedMotion ? 0.05 : 0.12);
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.16) * 0.1;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.08
      );
    }

    if (shellRef.current) {
      shellRef.current.rotation.z -= delta * 0.04;
      shellRef.current.scale.setScalar(1.22 + uniforms.uEnergy.value * 0.03);
      const material = shellRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.13 + uniforms.uBrightness.value * 0.05;
      material.color.lerp(new THREE.Color(colors.secondary), 0.06);
    }

    if (floorRef.current) {
      const material = floorRef.current.material as THREE.MeshBasicMaterial;
      const pulse = mode === "answering" ? 0.12 : mode === "thinking" ? 0.09 : 0.05;
      material.opacity = pulse + contextRatio * 0.04;
    }
  });

  return (
    <group position={[0, 0.3, 0]}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.7, 18]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          uniforms={uniforms}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
        />
      </mesh>

      <mesh ref={shellRef}>
        <icosahedronGeometry args={[2.04, 10]} />
        <meshBasicMaterial
          color={ORB_COLORS.idle.secondary}
          transparent
          opacity={0.12}
          wireframe
        />
      </mesh>

      <mesh ref={floorRef} position={[0, -2.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.75, 72]} />
        <meshBasicMaterial color="#d6deff" transparent opacity={0.06} />
      </mesh>
    </group>
  );
}

function makeStars() {
  return Array.from({ length: 18 }, (_, index) => ({
    id: `star-${index}`,
    size: 1.5 + (index % 3),
    left: 8 + ((index * 11) % 78),
    top: 8 + ((index * 17) % 48),
    duration: 12 + (index % 5) * 3,
    delay: index * 0.35,
  }));
}

function makeVeins() {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `vein-${index}`,
    left: `${15 + index * 19}%`,
    width: `${10 + index * 2}%`,
    delay: index * 1.2,
    duration: 9 + index * 2,
  }));
}

export function OrbScene({
  mode,
  identity,
  contextRatio,
  health,
  echoes,
  reducedMotion,
}: OrbSceneProps) {
  const stars = useMemo(makeStars, []);
  const veins = useMemo(makeVeins, []);

  const healthColor =
    health?.status === "critical"
      ? "bg-rose-400"
      : health?.status === "warning"
        ? "bg-amber-300"
        : "bg-cyan-200";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[58vh] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(145,135,255,0.16),_transparent_42%),radial-gradient(circle_at_50%_45%,_rgba(99,102,241,0.12),_transparent_28%),linear-gradient(to_bottom,_transparent_0%,_rgba(2,6,23,0.16)_74%,_rgba(2,6,23,0.82)_100%)]" />

      <div className="absolute inset-x-0 top-0 h-48 opacity-60">
        {veins.map((vein) => (
          <motion.div
            key={vein.id}
            className="absolute top-0 h-full rounded-full bg-[linear-gradient(to_bottom,transparent,rgba(205,214,255,0.2),transparent)] blur-xl"
            style={{ left: vein.left, width: vein.width }}
            animate={
              reducedMotion
                ? { opacity: 0.28 }
                : { opacity: [0.16, 0.4, 0.16], y: [0, 6, 0] }
            }
            transition={{
              duration: vein.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: vein.delay,
            }}
          />
        ))}
      </div>

      <Canvas
        camera={{ position: [0, 0, 6], fov: 44 }}
        dpr={[1, 1.8]}
        className="absolute inset-0"
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[0, 2.5, 4]} intensity={1.35} color="#eef2ff" />
        <directionalLight position={[-3, -1, 2]} intensity={0.4} color="#7c3aed" />
        <OrbCore
          mode={mode}
          contextRatio={contextRatio}
          reducedMotion={reducedMotion}
        />
      </Canvas>

      <div className="absolute inset-0">
        {stars.map((star) => (
          <motion.span
            key={star.id}
            className="absolute rounded-full bg-white/80"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
            }}
            animate={
              reducedMotion
                ? { opacity: 0.35 }
                : {
                    opacity: [0.18, 0.88, 0.18],
                    y: [0, -8, 0],
                    scale: [1, 1.25, 1],
                  }
            }
            transition={{
              duration: star.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: star.delay,
            }}
          />
        ))}
      </div>

      <div className="absolute inset-x-0 top-7 flex items-start justify-between px-5 text-[11px] uppercase tracking-[0.35em] text-white/45 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="rounded-full border border-white/8 bg-white/4 px-4 py-2 backdrop-blur-xl"
        >
          <span className="text-white/70">{identity?.name ?? "Arc"}</span>
          <span className="mx-2 text-white/20">/</span>
          <span className="tracking-[0.28em]">{identity?.subtitle ?? "Agent of Agents"}</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08 }}
          className="flex items-center gap-3 rounded-full border border-white/8 bg-white/4 px-4 py-2 backdrop-blur-xl"
        >
          <span className={`h-2 w-2 rounded-full ${healthColor}`} />
          <span>{Math.round(contextRatio * 100)}% context</span>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.18 }}
        className="absolute inset-x-0 top-[43vh] flex justify-center"
      >
        <div className="rounded-full border border-white/8 bg-white/5 px-5 py-2 text-[11px] uppercase tracking-[0.4em] text-white/50 backdrop-blur-xl">
          {mode === "thinking"
            ? "Processing the chamber"
            : mode === "answering"
              ? "Materializing response"
              : mode === "paused"
                ? "Awaiting operator"
                : mode === "error"
                  ? "Voltage drop detected"
                  : "Sleeping colossus"}
        </div>
      </motion.div>

      <AnimatePresence>
        {echoes.slice(-3).map((echo, index) => {
          const offset = CHILD_ORBIT_OFFSETS[index % CHILD_ORBIT_OFFSETS.length];
          return (
            <motion.div
              key={echo.id}
              className="absolute left-1/2 top-[28%]"
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.2 }}
              animate={{
                x: offset.x,
                y: offset.y,
                opacity: echo.status === "completed" ? 0.55 : 0.95,
                scale: echo.status === "running" ? 1 : 0.88,
              }}
              exit={{ opacity: 0, scale: 0.1, filter: "blur(18px)" }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            >
              <motion.div
                className="absolute bottom-4 left-1/2 h-28 w-px -translate-x-1/2 bg-[linear-gradient(to_bottom,rgba(201,213,255,0.38),rgba(201,213,255,0.03),transparent)]"
                animate={reducedMotion ? { opacity: 0.5 } : { opacity: [0.2, 0.75, 0.2] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="flex flex-col items-center gap-3">
                <motion.div
                  className="h-5 w-5 rounded-full border border-white/40 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.95),rgba(151,168,255,0.48),rgba(60,20,120,0.16))] shadow-[0_0_30px_rgba(147,197,253,0.26)]"
                  animate={
                    reducedMotion
                      ? { opacity: 0.8 }
                      : { scale: [0.95, 1.1, 0.95], opacity: [0.7, 1, 0.7] }
                  }
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-center backdrop-blur-xl">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">
                    {echo.status}
                  </div>
                  <div className="mt-1 text-[11px] font-medium tracking-[0.24em] text-white/72">
                    {echo.name}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

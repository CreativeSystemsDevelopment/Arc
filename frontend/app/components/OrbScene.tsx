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

const ORB_COLORS: Record<OrbMode, { primary: string; secondary: string; glow: string }> = {
  idle: { primary: "#5a5abf", secondary: "#a8b0ff", glow: "#6b5ce8" },
  thinking: { primary: "#7a5fff", secondary: "#e8e0ff", glow: "#a78bfa" },
  answering: { primary: "#4aa3ff", secondary: "#ffffff", glow: "#60c5ff" },
  paused: { primary: "#6b5ce8", secondary: "#c9c3ff", glow: "#8b7cf8" },
  error: { primary: "#b91c4a", secondary: "#ffc8dd", glow: "#ff6b8a" },
};

// Enhanced vertex shader with multi-layer wave interference
const VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uDistortion;
  
  // Simplex noise function for organic waves
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vNormal = normal;
    
    // Layer 1: Slow gentle waves (idle)
    float idleWave = snoise(vec3(position * 0.8 + uTime * 0.15)) * 0.08;
    
    // Layer 2: Medium frequency waves (always present, increases with energy)
    float midWave = sin(position.y * 4.0 + uTime * 0.6) * 0.06 * uEnergy;
    midWave += sin((position.x + position.z) * 3.5 + uTime * 0.4) * 0.04 * uEnergy;
    
    // Layer 3: High frequency distortion (thinking/active states)
    float highWave = snoise(vec3(position * 2.0 + uTime * 1.2)) * 0.12 * uDistortion;
    
    // Layer 4: Pulse wave (answering mode)
    float pulse = sin(uTime * 3.0) * 0.08 * uEnergy * uDistortion;
    
    // Combine all wave layers
    float totalDisplacement = idleWave + midWave + highWave + pulse;
    
    // Add turbulence in high-energy states
    float turbulence = snoise(vec3(position * 1.5 + uTime * 2.0)) * 0.05 * uDistortion * uEnergy;
    
    vec3 displaced = position + normal * (totalDisplacement + turbulence);
    vPosition = displaced;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uBrightness;
  uniform float uEnergy;
  uniform float uDistortion;
  uniform float uError;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uGlow;

  void main() {
    vec3 normal = normalize(vNormal);
    
    // Enhanced fresnel for liquid-like rim lighting
    float fresnel = pow(1.0 - abs(dot(normal, vec3(0.0, 0.0, 1.0))), 3.0);
    
    // Vertical gradient
    float vertical = smoothstep(0.0, 1.0, vUv.y);
    
    // Shimmer effect (stronger when active)
    float shimmer = 0.5 + 0.5 * sin(uTime * (0.5 + uEnergy * 2.0) + vUv.y * 8.0);
    
    // Energy pulse through the surface
    float energyPulse = 0.5 + 0.5 * sin(uTime * 2.0 + vPosition.y * 3.0);
    
    // Base color mixing
    vec3 base = mix(uPrimary, uSecondary, clamp(vertical * 0.6 + fresnel * 0.8, 0.0, 1.0));
    
    // Add glow influence (stronger at high energy)
    vec3 glowInfluence = uGlow * (0.3 + uEnergy * 0.4);
    base = mix(base, glowInfluence, fresnel * (0.4 + uEnergy * 0.3));
    
    // Apply brightness and shimmer
    vec3 lit = base * (0.7 + uBrightness * 0.3 + shimmer * 0.08 * uEnergy);
    
    // Add energy pulse glow
    lit += uGlow * energyPulse * 0.15 * uEnergy;
    
    // Error tinting
    vec3 errorTint = mix(lit, vec3(0.9, 0.3, 0.4), uError * 0.8);
    
    // Rim lighting boost for liquid effect
    float rimBoost = pow(fresnel, 2.0) * (0.5 + uEnergy * 0.5);
    errorTint += uGlow * rimBoost * 0.3;

    float alpha = clamp(0.9 + fresnel * 0.1, 0.0, 1.0);
    gl_FragColor = vec4(errorTint, alpha);
  }
`;

function OrbCore({
  mode,
  contextRatio,
  reducedMotion,
}: Pick<OrbSceneProps, "mode" | "contextRatio" | "reducedMotion">) {
  const meshRef = useRef<THREE.Mesh>(null);
  const particleRef = useRef<THREE.Points>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0.3 },
      uDistortion: { value: 0.1 },
      uBrightness: { value: 0.8 },
      uError: { value: 0 },
      uPrimary: { value: new THREE.Color(ORB_COLORS.idle.primary) },
      uSecondary: { value: new THREE.Color(ORB_COLORS.idle.secondary) },
      uGlow: { value: new THREE.Color(ORB_COLORS.idle.glow) },
    }),
    []
  );

  // Particle system for atmosphere
  const particleCount = 200;
  const particlePositions = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.5 + Math.random() * 1.5;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  useFrame((state, delta) => {
    const motionStep = reducedMotion ? delta * 0.15 : delta;
    const colors = ORB_COLORS[mode];

    // State-based target values
    const targetEnergy =
      mode === "thinking"
        ? 0.9 + contextRatio * 0.2
        : mode === "answering"
          ? 1.2 + contextRatio * 0.3
          : mode === "paused"
            ? 0.4
            : mode === "error"
              ? 0.2
              : 0.35; // idle - very low

    const targetDistortion =
      mode === "thinking"
        ? 0.8
        : mode === "answering"
          ? 1.0
          : mode === "paused"
            ? 0.3
            : mode === "error"
              ? 0.5
              : 0.1; // idle - minimal distortion

    const targetBrightness =
      mode === "thinking"
        ? 1.1
        : mode === "answering"
          ? 1.3
          : mode === "paused"
            ? 0.7
            : mode === "error"
              ? 0.5
              : 0.8; // idle - soft glow

    // Smooth interpolation
    const lerpSpeed = reducedMotion ? 0.04 : 0.08;

    uniforms.uTime.value += motionStep;
    uniforms.uEnergy.value = THREE.MathUtils.lerp(uniforms.uEnergy.value, targetEnergy, lerpSpeed);
    uniforms.uDistortion.value = THREE.MathUtils.lerp(uniforms.uDistortion.value, targetDistortion, lerpSpeed);
    uniforms.uBrightness.value = THREE.MathUtils.lerp(
      uniforms.uBrightness.value,
      targetBrightness + Math.sin(state.clock.elapsedTime * 0.5) * 0.05,
      lerpSpeed
    );
    uniforms.uError.value = THREE.MathUtils.lerp(uniforms.uError.value, mode === "error" ? 1 : 0, 0.12);
    
    // Color transitions
    uniforms.uPrimary.value.lerp(new THREE.Color(colors.primary), lerpSpeed);
    uniforms.uSecondary.value.lerp(new THREE.Color(colors.secondary), lerpSpeed);
    uniforms.uGlow.value.lerp(new THREE.Color(colors.glow), lerpSpeed);

    // Mesh transformations
    if (meshRef.current) {
      const targetScale =
        mode === "thinking"
          ? 1.05
          : mode === "answering"
            ? 1.08 + Math.sin(state.clock.elapsedTime * 4) * 0.02 // breathing
            : mode === "paused"
              ? 0.98
              : mode === "error"
                ? 0.95
                : 1.0;

      // Rotation: idle is slow, thinking/answering faster
      const rotationSpeed = reducedMotion
        ? 0.02
        : mode === "idle"
          ? 0.03
          : mode === "thinking"
            ? 0.12
            : mode === "answering"
              ? 0.08
              : 0.05;

      meshRef.current.rotation.y += delta * rotationSpeed;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.12) * 0.03;
      meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.08) * 0.02;
      
      // Gentle floating
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.05 * (mode === "idle" ? 0.5 : 1);
      
      // Scale with smooth transition
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), lerpSpeed);
    }

    // Particle animation
    if (particleRef.current) {
      const positions = particleRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        // Orbit particles around the sphere
        const speed = reducedMotion ? 0.1 : (mode === "idle" ? 0.2 : 0.5 + uEnergy.value * 0.5);
        const angle = state.clock.elapsedTime * speed * 0.1 + i * 0.1;
        const radius = 2.8 + Math.sin(angle * 2 + i) * 0.2;
        
        positions[i3 + 1] += Math.sin(state.clock.elapsedTime + i) * 0.002 * (1 + uniforms.uEnergy.value);
      }
      particleRef.current.geometry.attributes.position.needsUpdate = true;
      
      // Particle opacity based on mode
      const material = particleRef.current.material as THREE.PointsMaterial;
      material.opacity = 0.3 + uniforms.uEnergy.value * 0.3;
    }
  });

  return (
    <>
      <group position={[0, 0.5, 0]}>
        {/* Main orb with enhanced shader */}
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[3.5, 32]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            uniforms={uniforms}
            vertexShader={VERTEX_SHADER}
            fragmentShader={FRAGMENT_SHADER}
          />
        </mesh>

        {/* Inner core glow */}
        <mesh>
          <sphereGeometry args={[1.8, 32, 32]} />
          <meshBasicMaterial
            color={uniforms.uGlow.value}
            transparent
            opacity={0.15}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Atmosphere particles */}
        <points ref={particleRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={particleCount}
              array={particlePositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.03}
            color={uniforms.uGlow.value}
            transparent
            opacity={0.4}
            sizeAttenuation
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>

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
      {/* Background atmosphere */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-8%,rgba(135,122,255,0.22),transparent_28%),linear-gradient(to_bottom,rgba(0,0,0,0)_6%,rgba(4,6,10,0.04)_34%,rgba(3,5,9,0.22)_100%)]"
        animate={
          reducedMotion
            ? { opacity: 1 }
            : { opacity: [0.88, 1, 0.9], scale: [1, 1.015, 1] }
        }
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Glow halo */}
      <motion.div
        className="absolute left-1/2 top-[12%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(220,225,255,0.18),rgba(108,118,190,0.08),transparent_72%)] blur-[92px]"
        animate={
          reducedMotion
            ? { opacity: 0.5 }
            : mode === "idle"
              ? { opacity: [0.3, 0.4, 0.35], scale: [0.96, 1.02, 0.98] }
              : { opacity: [0.4, 0.65, 0.45], scale: [0.96, 1.04, 0.98] }
        }
        transition={{ duration: mode === "idle" ? 8 : 4, repeat: Infinity, ease: "easeInOut" }}
      />


      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [0, 0.5, 10], fov: 35 }}
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

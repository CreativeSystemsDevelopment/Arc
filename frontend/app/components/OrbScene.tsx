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
  orbSpeed?: number;
  orbDistortion?: number;
  orbGlow?: number;
  ambientLight?: number;
  orbColors?: boolean;
  showParticles?: boolean;
  showReflections?: boolean;
}

type ModeDynamics = {
  energy: number;
  distortion: number;
  brightness: number;
  pulse: number;
  coherence: number;
  tension: number;
  rotation: number;
  scale: number;
  floatAmp: number;
  particleSpeed: number;
  particleSpread: number;
};

const ORB_COLORS: Record<OrbMode, { primary: string; secondary: string; glow: string }> = {
  idle: { primary: "#5661bf", secondary: "#b8c4ff", glow: "#7b6ff2" },
  thinking: { primary: "#7558ff", secondary: "#e9e3ff", glow: "#ab93ff" },
  answering: { primary: "#3f94ff", secondary: "#f4fbff", glow: "#66d3ff" },
  paused: { primary: "#5966a8", secondary: "#c6d0f8", glow: "#8294d6" },
  error: { primary: "#a62352", secondary: "#ffc2d5", glow: "#ff5f89" },
};

const MODE_DYNAMICS: Record<OrbMode, ModeDynamics> = {
  idle: {
    energy: 0.28,
    distortion: 0.11,
    brightness: 0.76,
    pulse: 0.1,
    coherence: 0.68,
    tension: 0.04,
    rotation: 0.02,
    scale: 0.996,
    floatAmp: 0.018,
    particleSpeed: 0.1,
    particleSpread: 0.1,
  },
  thinking: {
    energy: 0.92,
    distortion: 0.74,
    brightness: 0.96,
    pulse: 0.44,
    coherence: 0.5,
    tension: 0.22,
    rotation: 0.08,
    scale: 1.03,
    floatAmp: 0.03,
    particleSpeed: 0.28,
    particleSpread: 0.2,
  },
  answering: {
    energy: 1.14,
    distortion: 0.52,
    brightness: 1.22,
    pulse: 1.25,
    coherence: 0.93,
    tension: 0.2,
    rotation: 0.075,
    scale: 1.06,
    floatAmp: 0.026,
    particleSpeed: 0.34,
    particleSpread: 0.16,
  },
  paused: {
    energy: 0.22,
    distortion: 0.07,
    brightness: 0.58,
    pulse: 0.04,
    coherence: 0.74,
    tension: 0.03,
    rotation: 0.01,
    scale: 0.972,
    floatAmp: 0.01,
    particleSpeed: 0.06,
    particleSpread: 0.08,
  },
  error: {
    energy: 0.62,
    distortion: 0.9,
    brightness: 0.66,
    pulse: 0.72,
    coherence: 0.28,
    tension: 0.88,
    rotation: 0.06,
    scale: 0.956,
    floatAmp: 0.018,
    particleSpeed: 0.52,
    particleSpread: 0.14,
  },
};

const VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uDistortion;
  uniform float uPulse;
  uniform float uCoherence;
  uniform float uTension;

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

    float lowField = snoise(vec3(position * 0.72 + uTime * 0.14)) * 0.07;
    float midField = sin(position.y * 4.3 + uTime * 0.7) * 0.05 * uEnergy;
    midField += sin((position.x + position.z) * 3.8 - uTime * 0.42) * 0.035 * uEnergy;
    float highField = snoise(vec3(position * 2.25 + uTime * 1.35)) * 0.11;
    float ridge = abs(sin(dot(normalize(position), vec3(1.5, 0.8, 1.2)) * 15.0 + uTime * 1.1)) - 0.5;
    float exploration = highField * (1.0 - uCoherence) * uDistortion;
    float convergentPulse =
      sin(uTime * (1.8 + uPulse) + dot(normalize(position), vec3(1.2, 0.9, 0.7)) * 11.0) *
      0.05 * uPulse * uCoherence;
    float constrainedInstability = snoise(vec3(position * 3.0 + uTime * 2.8)) * 0.06 * uTension;
    float totalDisplacement =
      lowField +
      midField +
      exploration +
      ridge * 0.035 * uEnergy +
      convergentPulse +
      constrainedInstability;

    vec3 displaced = position * (1.0 - uTension * 0.015) + normal * totalDisplacement;
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
  uniform float uError;
  uniform float uPulse;
  uniform float uCoherence;
  uniform float uTransition;
  uniform vec4 uModeMix;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uGlow;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
    vec3 lightDir = normalize(vec3(-0.5, 0.85, 0.35));
    float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 2.7);
    float vertical = smoothstep(0.0, 1.0, vUv.y);
    float shimmer = 0.5 + 0.5 * sin(uTime * (0.35 + uEnergy * 1.8) + vUv.y * 9.0);
    float pulseWave = 0.5 + 0.5 * sin(uTime * (2.0 + uPulse * 1.7) + vPosition.y * 3.2);
    float micro = (hash(vUv * 320.0 + uTime * 0.08) - 0.5) * 0.05;
    float lattice = smoothstep(0.88, 1.0, abs(sin((vUv.x - vUv.y) * 34.0 + uTime * 1.4)));
    float convergence = smoothstep(0.8, 1.0, sin((vUv.x + vUv.y) * 18.0 - uTime * 3.4));
    float pausedVeil = (0.55 + 0.45 * vertical) * uModeMix.z;
    float errorFracture = smoothstep(0.82, 1.0, abs(sin(vUv.y * 42.0 + uTime * 8.0 + vPosition.x * 2.0))) * uModeMix.w;
    float thinkingVein = lattice * uModeMix.x;
    float answeringFlow = convergence * uModeMix.y * uPulse;

    vec3 base = mix(uPrimary, uSecondary, clamp(vertical * 0.62 + fresnel * 0.74, 0.0, 1.0));
    vec3 glowInfluence = uGlow * (0.2 + uEnergy * 0.34);
    vec3 lit = mix(base, glowInfluence, fresnel * (0.42 + uEnergy * 0.24));
    lit *= (0.66 + uBrightness * 0.3 + shimmer * mix(0.02, 0.08, uPulse) * uEnergy + micro);

    vec3 reflected = reflect(-lightDir, normal);
    float specular = pow(max(dot(reflected, viewDir), 0.0), 22.0) * (0.18 + uCoherence * 0.3);
    float rimBoost = pow(fresnel, 2.0) * (0.45 + uEnergy * 0.42);

    float forceBand = smoothstep(0.55, 1.0, fresnel) * (uPulse * uCoherence + uModeMix.w * 0.25);
    lit += uGlow * pulseWave * (0.07 + 0.14 * uPulse);
    lit += uGlow * (thinkingVein * 0.07 + answeringFlow * 0.16 + forceBand * 0.18);
    lit += vec3(0.85, 0.92, 1.0) * specular;
    lit += uGlow * rimBoost * 0.28;
    lit = mix(lit, lit * 0.78 + vec3(0.06, 0.09, 0.14), pausedVeil);

    vec3 errorTint = mix(lit, vec3(0.84, 0.18, 0.32), uError * 0.4 + errorFracture * 0.3);
    float alpha = clamp(0.9 + fresnel * 0.08 + uTransition * 0.02, 0.0, 1.0);
    gl_FragColor = vec4(errorTint, alpha);
  }
`;

function NeuralLace({
  mode,
  energy,
  glowColor,
  reducedMotion,
}: {
  mode: OrbMode;
  energy: number;
  glowColor: THREE.Color;
  reducedMotion: boolean;
}) {
  const laceRef = useRef<THREE.LineSegments>(null);

  const { geometry, edgeCount } = useMemo(() => {
    const ico = new THREE.IcosahedronGeometry(3.7, 1);
    const edges = new THREE.EdgesGeometry(ico);
    const count = edges.attributes.position.count / 2;
    return { geometry: edges, edgeCount: count };
  }, []);

  const edgeOpacities = useMemo(
    () => new Float32Array(edgeCount * 2).fill(0.08),
    [edgeCount]
  );

  useFrame((state) => {
    if (!laceRef.current) return;
    const t = state.clock.elapsedTime;
    const motionScale = reducedMotion ? 0.16 : 1;

    for (let i = 0; i < edgeCount; i++) {
      const phase = Math.sin(t * (0.65 + energy * 1.15) * motionScale + i * 1.55);
      const wave =
        mode === "thinking"
          ? Math.max(0, phase) * 0.78
          : mode === "answering"
            ? 0.3 + (0.5 + 0.5 * Math.sin(t * 2.1 + i * 0.36)) * 0.55
            : mode === "paused"
              ? 0.04 + Math.max(0, phase) * 0.08
              : mode === "error"
                ? Math.abs(Math.sin(t * 3.8 + i * 0.92)) * 0.52
                : phase * 0.14 + 0.09;

      const opacity = Math.min(0.85, wave * energy);
      edgeOpacities[i * 2] = opacity;
      edgeOpacities[i * 2 + 1] = opacity;
    }

    const attr = laceRef.current.geometry.getAttribute("opacity");
    if (attr) {
      (attr.array as Float32Array).set(edgeOpacities);
      attr.needsUpdate = true;
    }

    const turnRate =
      mode === "thinking"
        ? 0.04
        : mode === "answering"
          ? 0.028
          : mode === "paused"
            ? 0.01
            : mode === "error"
              ? 0.06
              : 0.02;
    laceRef.current.rotation.y = t * turnRate * motionScale;
    laceRef.current.rotation.x = Math.sin(t * 0.1) * (mode === "error" ? 0.03 : 0.015);
  });

  const shaderMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: glowColor },
        },
        vertexShader: `
          attribute float opacity;
          varying float vOpacity;
          void main() {
            vOpacity = opacity;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vOpacity;
          void main() {
            gl_FragColor = vec4(uColor, vOpacity);
          }
        `,
      }),
    [glowColor]
  );

  return (
    <lineSegments ref={laceRef} frustumCulled={false}>
      <primitive object={geometry} attach="geometry">
        <bufferAttribute
          attach="attributes-opacity"
          args={[edgeOpacities, 1]}
        />
      </primitive>
      <primitive object={shaderMat} attach="material" />
    </lineSegments>
  );
}

function OrbCore({
  mode,
  contextRatio,
  reducedMotion,
  orbSpeed = 1,
  orbDistortion = 1,
  orbGlow = 1,
  orbColors = true,
  showParticles = true,
}: Pick<
  OrbSceneProps,
  | "mode"
  | "contextRatio"
  | "reducedMotion"
  | "orbSpeed"
  | "orbDistortion"
  | "orbGlow"
  | "orbColors"
  | "showParticles"
>) {
  const meshRef = useRef<THREE.Mesh>(null);
  const particleRef = useRef<THREE.Points>(null);
  const previousModeRef = useRef<OrbMode>(mode);
  const modeTransitionRef = useRef(1);
  const scaleTargetRef = useRef(new THREE.Vector3(1, 1, 1));

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0.3 },
      uDistortion: { value: 0.1 },
      uBrightness: { value: 0.8 },
      uError: { value: 0 },
      uPulse: { value: 0.2 },
      uCoherence: { value: 0.6 },
      uTension: { value: 0.08 },
      uTransition: { value: 1 },
      uModeMix: { value: new THREE.Vector4(0, 0, 0, 0) },
      uPrimary: { value: new THREE.Color(ORB_COLORS.idle.primary) },
      uSecondary: { value: new THREE.Color(ORB_COLORS.idle.secondary) },
      uGlow: { value: new THREE.Color(ORB_COLORS.idle.glow) },
    }),
    []
  );

  const particleCount = 200;
  const particleSeed = useMemo(() => {
    const theta = new Float32Array(particleCount);
    const phi = new Float32Array(particleCount);
    const radius = new Float32Array(particleCount);
    const drift = new Float32Array(particleCount);
    const dirX = new Float32Array(particleCount);
    const dirY = new Float32Array(particleCount);
    const dirZ = new Float32Array(particleCount);
    const inflowSpeed = new Float32Array(particleCount);
    const orbitMix = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      theta[i] = Math.random() * Math.PI * 2;
      phi[i] = Math.acos(2 * Math.random() - 1);
      radius[i] = 8.4 + Math.random() * 3.2;
      drift[i] = Math.random() * Math.PI * 2;
      inflowSpeed[i] = 0.5 + Math.random() * 0.9;
      orbitMix[i] = 0.2 + Math.random() * 0.7;

      // Bias most ingress vectors toward the viewer side (+Z) so flow can
      // feel like it comes from the user's direction into the orb.
      let x = Math.random() * 2 - 1;
      let y = Math.random() * 2 - 1;
      let z = Math.random() < 0.7 ? 0.3 + Math.random() * 1.2 : Math.random() * 2 - 1;
      const len = Math.hypot(x, y, z) || 1;
      x /= len;
      y /= len;
      z /= len;
      dirX[i] = x;
      dirY[i] = y;
      dirZ[i] = z;
    }
    return { theta, phi, radius, drift, dirX, dirY, dirZ, inflowSpeed, orbitMix };
  }, [particleCount]);

  const particlePositions = useMemo<Float32Array>(() => {
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const r = particleSeed.radius[i];
      positions[i * 3] = r * Math.sin(particleSeed.phi[i]) * Math.cos(particleSeed.theta[i]);
      positions[i * 3 + 1] = r * Math.sin(particleSeed.phi[i]) * Math.sin(particleSeed.theta[i]);
      positions[i * 3 + 2] = r * Math.cos(particleSeed.phi[i]);
    }
    return positions;
  }, [particleCount, particleSeed]);

  const colorTargets = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(ORB_COLORS) as OrbMode[]).map((entry) => [
          entry,
          {
            primary: new THREE.Color(ORB_COLORS[entry].primary),
            secondary: new THREE.Color(ORB_COLORS[entry].secondary),
            glow: new THREE.Color(ORB_COLORS[entry].glow),
          },
        ])
      ) as Record<
        OrbMode,
        { primary: THREE.Color; secondary: THREE.Color; glow: THREE.Color }
      >,
    []
  );

  useFrame((state, delta) => {
    const motionStep = reducedMotion ? delta * 0.18 : delta;
    if (previousModeRef.current !== mode) {
      previousModeRef.current = mode;
      modeTransitionRef.current = 0;
    }
    modeTransitionRef.current = Math.min(
      1,
      modeTransitionRef.current + delta * (reducedMotion ? 2.8 : 4.4)
    );

    const colors = orbColors ? colorTargets[mode] : colorTargets.idle;
    const signature = MODE_DYNAMICS[mode];
    const contextBoost = THREE.MathUtils.clamp(contextRatio, 0, 1);

    const targetEnergy = signature.energy + (mode === "thinking" ? contextBoost * 0.18 : 0);
    const targetDistortion =
      signature.distortion * Math.max(orbDistortion, 0.1) +
      (mode === "answering" ? contextBoost * 0.1 : 0);
    const pulseVariance = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.58) * 0.04;
    const targetBrightness = (signature.brightness + pulseVariance) * Math.max(orbGlow, 0.1);

    const targetModeMix = new THREE.Vector4(
      mode === "thinking" ? 1 : 0,
      mode === "answering" ? 1 : 0,
      mode === "paused" ? 1 : 0,
      mode === "error" ? 1 : 0
    );

    const lerpSpeed = reducedMotion ? 0.05 : 0.1;

    uniforms.uTime.value += motionStep * Math.max(orbSpeed, 0.1);
    uniforms.uEnergy.value = THREE.MathUtils.lerp(uniforms.uEnergy.value, targetEnergy, lerpSpeed);
    uniforms.uDistortion.value = THREE.MathUtils.lerp(
      uniforms.uDistortion.value,
      targetDistortion,
      lerpSpeed
    );
    uniforms.uBrightness.value = THREE.MathUtils.lerp(
      uniforms.uBrightness.value,
      targetBrightness,
      lerpSpeed
    );
    uniforms.uPulse.value = THREE.MathUtils.lerp(uniforms.uPulse.value, signature.pulse, lerpSpeed);
    uniforms.uCoherence.value = THREE.MathUtils.lerp(
      uniforms.uCoherence.value,
      signature.coherence,
      lerpSpeed
    );
    uniforms.uTension.value = THREE.MathUtils.lerp(uniforms.uTension.value, signature.tension, lerpSpeed);
    uniforms.uTransition.value = modeTransitionRef.current;
    uniforms.uError.value = THREE.MathUtils.lerp(uniforms.uError.value, mode === "error" ? 1 : 0, 0.12);
    uniforms.uModeMix.value.lerp(targetModeMix, lerpSpeed);

    uniforms.uPrimary.value.lerp(colors.primary, lerpSpeed);
    uniforms.uSecondary.value.lerp(colors.secondary, lerpSpeed);
    uniforms.uGlow.value.lerp(colors.glow, lerpSpeed);

    if (meshRef.current) {
      const breathing =
        reducedMotion || mode !== "answering"
          ? 0
          : Math.sin(state.clock.elapsedTime * 3.6) * 0.017;
      // As context fills, the orb should feel denser/more present.
      const contextScaleBoost =
        mode === "thinking" || mode === "answering"
          ? contextBoost * 0.11
          : contextBoost * 0.05;
      const targetScale = signature.scale + contextScaleBoost + breathing;
      const rotationSpeed = reducedMotion
        ? signature.rotation * 0.35
        : signature.rotation * Math.max(orbSpeed, 0.1);

      meshRef.current.rotation.y += delta * rotationSpeed;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.14) * (mode === "thinking" ? 0.048 : 0.03);
      meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.09) * (mode === "error" ? 0.03 : 0.018);
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.24) * signature.floatAmp;
      scaleTargetRef.current.set(targetScale, targetScale, targetScale);
      meshRef.current.scale.lerp(scaleTargetRef.current, lerpSpeed);
    }

    if (particleRef.current) {
      const positions = particleRef.current.geometry.attributes.position.array as Float32Array;
      const loopSpeed = reducedMotion
        ? signature.particleSpeed * 0.25
        : signature.particleSpeed * Math.max(orbSpeed, 0.1);
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const flow =
          (state.clock.elapsedTime * loopSpeed * particleSeed.inflowSpeed[i] + particleSeed.drift[i]) %
          1;
        const inward = Math.pow(1 - flow, 1.35);
        const nearCore = 1 - inward;

        // Inflow path from off-screen toward orb.
        const inflowRadius = particleSeed.radius[i] * inward + 2.15;
        const swirlAngle = particleSeed.theta[i] + state.clock.elapsedTime * 0.9 + i * 0.018;
        const swirlAmp = (0.09 + signature.particleSpread * 0.4) * (0.35 + inward * 0.65);
        const inflowX = particleSeed.dirX[i] * inflowRadius + Math.cos(swirlAngle) * swirlAmp;
        const inflowY =
          particleSeed.dirY[i] * inflowRadius +
          Math.sin(swirlAngle * 1.3 + particleSeed.phi[i]) * swirlAmp * 0.7;
        const inflowZ =
          particleSeed.dirZ[i] * inflowRadius + Math.cos(swirlAngle * 0.7 + particleSeed.drift[i]) * swirlAmp;

        // Near the orb, blend into a brief orbital shear before respawn.
        const orbitAngle = particleSeed.theta[i] + state.clock.elapsedTime * loopSpeed * 1.8 + i * 0.03;
        const orbitRadius =
          2.6 +
          Math.sin(state.clock.elapsedTime * 0.7 + particleSeed.drift[i]) *
            (0.15 + signature.particleSpread * 0.5);
        const orbitPolar =
          particleSeed.phi[i] + Math.sin(state.clock.elapsedTime * 0.42 + i * 0.09) * 0.03;
        const orbitX = orbitRadius * Math.sin(orbitPolar) * Math.cos(orbitAngle);
        const orbitY = orbitRadius * Math.cos(orbitPolar);
        const orbitZ = orbitRadius * Math.sin(orbitPolar) * Math.sin(orbitAngle);

        const blendToOrbit = THREE.MathUtils.clamp((nearCore - 0.62) / 0.35, 0, 1) * particleSeed.orbitMix[i];
        positions[i3] = THREE.MathUtils.lerp(inflowX, orbitX, blendToOrbit);
        positions[i3 + 1] = THREE.MathUtils.lerp(inflowY, orbitY, blendToOrbit);
        positions[i3 + 2] = THREE.MathUtils.lerp(inflowZ, orbitZ, blendToOrbit);
      }
      particleRef.current.geometry.attributes.position.needsUpdate = true;

      const material = particleRef.current.material as THREE.PointsMaterial;
      const baseOpacity =
        mode === "paused"
          ? 0.13
          : mode === "error"
            ? 0.22
            : mode === "answering"
              ? 0.36
              : mode === "thinking"
                ? 0.3
                : 0.2;
      const contextParticleBoost = 1 + contextBoost * (mode === "thinking" || mode === "answering" ? 0.45 : 0.2);
      material.opacity = showParticles
        ? baseOpacity * Math.max(orbGlow, 0.1) * contextParticleBoost
        : 0;
      material.size =
        (mode === "answering" ? 0.037 : mode === "paused" ? 0.024 : 0.03) *
        (1 + contextBoost * 0.22);
      material.color.copy(uniforms.uGlow.value);
    }
  });

  return (
    <group position={[0, 0.5, 0]}>
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

      <NeuralLace
        mode={mode}
        energy={uniforms.uEnergy.value}
        glowColor={uniforms.uGlow.value}
        reducedMotion={reducedMotion}
      />

      <mesh>
        <sphereGeometry args={[1.8, 32, 32]} />
        <meshBasicMaterial
          color={uniforms.uGlow.value}
          transparent
          opacity={0.18}
          side={THREE.BackSide}
        />
      </mesh>

      <points ref={particleRef} visible={showParticles}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
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
  );
}

export function OrbScene({
  mode,
  contextRatio,
  reducedMotion,
  orbSpeed = 1,
  orbDistortion = 1,
  orbGlow = 1,
  ambientLight = 0.8,
  orbColors = true,
  showParticles = true,
  showReflections = true,
}: OrbSceneProps) {
  const modeAtmosphere = useMemo(() => {
    if (mode === "thinking") {
      return {
        bgOpacity: [0.8, 0.92, 0.82],
        bgScale: [1, 1.015, 1],
        haloOpacity: [0.28, 0.42, 0.31],
        haloScale: [0.97, 1.03, 0.98],
        duration: 4.4,
      };
    }
    if (mode === "answering") {
      return {
        bgOpacity: [0.88, 0.97, 0.9],
        bgScale: [1, 1.016, 1],
        haloOpacity: [0.36, 0.58, 0.4],
        haloScale: [0.98, 1.07, 1],
        duration: 3.4,
      };
    }
    if (mode === "paused") {
      return {
        bgOpacity: [0.72, 0.78, 0.74],
        bgScale: [1, 1.005, 1],
        haloOpacity: [0.2, 0.26, 0.22],
        haloScale: [0.96, 1, 0.97],
        duration: 8,
      };
    }
    if (mode === "error") {
      return {
        bgOpacity: [0.76, 0.86, 0.78],
        bgScale: [1, 1.012, 1],
        haloOpacity: [0.24, 0.46, 0.28],
        haloScale: [0.96, 1.035, 0.98],
        duration: 2.9,
      };
    }
    return {
      bgOpacity: [0.82, 0.9, 0.84],
      bgScale: [1, 1.008, 1],
      haloOpacity: [0.22, 0.3, 0.25],
      haloScale: [0.98, 1.015, 0.99],
      duration: 8.4,
    };
  }, [mode]);

  const directionalColor =
    mode === "error"
      ? "#ffd6df"
      : mode === "answering"
        ? "#f2fbff"
        : mode === "paused"
          ? "#e8edff"
          : "#f3f6ff";
  const pointColor =
    mode === "error"
      ? "#ff7aa3"
      : mode === "thinking"
        ? "#8b8dff"
        : mode === "paused"
          ? "#88a2d6"
          : "#89a6ff";

  return (
    <div className="pointer-events-none absolute inset-0">
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-8%,rgba(135,122,255,0.22),transparent_28%),linear-gradient(to_bottom,rgba(0,0,0,0)_6%,rgba(4,6,10,0.04)_34%,rgba(3,5,9,0.22)_100%)]"
        animate={
          reducedMotion
            ? { opacity: 1 }
            : { opacity: modeAtmosphere.bgOpacity, scale: modeAtmosphere.bgScale }
        }
        transition={{ duration: modeAtmosphere.duration + 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute left-1/2 top-[12%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(220,225,255,0.18),rgba(108,118,190,0.08),transparent_72%)] blur-[92px]"
        animate={
          reducedMotion
            ? { opacity: 0.42 * Math.max(orbGlow, 0.1) }
            : {
                opacity: modeAtmosphere.haloOpacity.map((v) => v * Math.max(orbGlow, 0.1)),
                scale: modeAtmosphere.haloScale,
              }
        }
        transition={{ duration: modeAtmosphere.duration, repeat: Infinity, ease: "easeInOut" }}
      />

      {showReflections && (
        <motion.div
          className="absolute inset-x-[20%] bottom-[12%] h-20 rounded-full bg-[radial-gradient(circle,rgba(183,197,255,0.12),rgba(76,89,150,0.04),transparent_70%)] blur-2xl"
          animate={
            reducedMotion
              ? { opacity: 0.45 }
              : mode === "answering"
                ? { opacity: [0.3, 0.62, 0.35], scaleX: [0.95, 1.08, 0.98] }
                : mode === "error"
                  ? { opacity: [0.22, 0.5, 0.26], scaleX: [0.94, 1.03, 0.97] }
                  : mode === "paused"
                    ? { opacity: [0.18, 0.22, 0.2], scaleX: [0.96, 1, 0.97] }
                    : { opacity: [0.2, 0.34, 0.24], scaleX: [0.95, 1.04, 0.98] }
          }
          transition={{ duration: reducedMotion ? 0.2 : 4.6, repeat: reducedMotion ? 0 : Infinity, ease: "easeInOut" }}
        />
      )}

      <Canvas
        camera={{ position: [0, 0.5, 10], fov: 35 }}
        dpr={[1, 1.6]}
        className="absolute inset-0"
      >
        <ambientLight intensity={Math.max(0.05, ambientLight * 0.35)} color="#dfe5ff" />
        <directionalLight
          position={[0.8, 4.2, 3.6]}
          intensity={
            Math.max(0.2, 1.28 * Math.max(orbGlow, 0.1)) *
            (mode === "paused" ? 0.72 : mode === "error" ? 0.84 : 1)
          }
          color={directionalColor}
        />
        <pointLight
          position={[0, 2.4, 2.8]}
          intensity={
            Math.max(0.05, 0.3 * Math.max(orbGlow, 0.1)) *
            (mode === "answering" ? 1.4 : mode === "paused" ? 0.6 : 1)
          }
          distance={8}
          color={pointColor}
        />
        <OrbCore
          mode={mode}
          contextRatio={contextRatio}
          reducedMotion={reducedMotion}
          orbSpeed={orbSpeed}
          orbDistortion={orbDistortion}
          orbGlow={orbGlow}
          orbColors={orbColors}
          showParticles={showParticles}
        />
      </Canvas>
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import type {
  HealthPayload,
  OrbMode,
  SubagentEcho,
  ThreadRecord,
  UiMeta,
} from "./types";

interface OrbTopBarProps {
  meta: UiMeta | null;
  health: HealthPayload | null;
  orbMode: OrbMode;
  contextPercent: number;
  activeThread: ThreadRecord | null;
  subagentEchos: SubagentEcho[];
  onOpenThreads: () => void;
  onOpenOverlay: (kind: "skills" | "memories" | "config") => void;
}

function meterTone(percent: number) {
  if (percent >= 85) return "from-rose-300 via-fuchsia-300 to-violet-400";
  if (percent >= 70) return "from-amber-200 via-orange-200 to-amber-400";
  return "from-cyan-200 via-indigo-100 to-violet-300";
}

function orbLabel(mode: OrbMode) {
  switch (mode) {
    case "thinking":
      return "Thinking";
    case "answering":
      return "Answering";
    case "paused":
      return "Paused";
    case "error":
      return "Fault";
    default:
      return "Dormant";
  }
}

export function OrbTopBar({
  meta,
  health,
  orbMode,
  contextPercent,
  activeThread,
  subagentEchos,
  onOpenThreads,
  onOpenOverlay,
}: OrbTopBarProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-4 sm:px-8 sm:pt-6"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 text-[11px] uppercase tracking-[0.28em] text-white/55 sm:flex-row sm:items-start sm:justify-between">
        <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 backdrop-blur-xl">
          <div className="space-y-0.5">
            <p className="font-mono text-[10px] tracking-[0.34em] text-white/45">
              {meta?.identity.subtitle ?? "Agent of Agents"}
            </p>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-lg normal-case tracking-[0.16em] text-white/92">
                {meta?.identity.name ?? "Arc"}
              </h1>
              <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.24em] text-white/55">
                {orbLabel(orbMode)}
              </span>
            </div>
          </div>

          <div className="hidden h-8 w-px bg-white/10 sm:block" />

          <div className="hidden min-w-[200px] gap-3 sm:flex sm:flex-col">
            <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.24em] text-white/45">
              <span>Context</span>
              <span>{contextPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className={`h-full rounded-full bg-gradient-to-r ${meterTone(contextPercent)}`}
                animate={{ width: `${Math.max(contextPercent, 4)}%` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <StatusChip
            label="Health"
            value={health?.status ?? "syncing"}
            glow={
              health?.status === "critical"
                ? "rose"
                : health?.status === "warning"
                  ? "amber"
                  : "emerald"
            }
          />
          <StatusChip
            label="APCMS"
            value={meta?.topbar.apcms_status ?? "disabled"}
            glow="violet"
          />
          <StatusChip
            label="Children"
            value={String(subagentEchos.length)}
            glow="sky"
          />
          <button
            type="button"
            onClick={onOpenThreads}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] tracking-[0.24em] text-white/65 transition hover:border-white/20 hover:text-white"
          >
            {activeThread ? `Thread ${activeThread.id.slice(-4)}` : "Threads"}
          </button>
          <button
            type="button"
            onClick={() => onOpenOverlay("skills")}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] tracking-[0.24em] text-white/65 transition hover:border-white/20 hover:text-white"
          >
            Skills
          </button>
          <button
            type="button"
            onClick={() => onOpenOverlay("memories")}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] tracking-[0.24em] text-white/65 transition hover:border-white/20 hover:text-white"
          >
            Memories
          </button>
          <button
            type="button"
            onClick={() => onOpenOverlay("config")}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] tracking-[0.24em] text-white/65 transition hover:border-white/20 hover:text-white"
          >
            Config
          </button>
        </div>
      </div>
    </motion.header>
  );
}

function StatusChip({
  label,
  value,
  glow,
}: {
  label: string;
  value: string;
  glow: "emerald" | "amber" | "rose" | "violet" | "sky";
}) {
  const glowClass = {
    emerald: "from-emerald-200/20 to-emerald-400/5 text-emerald-100/80",
    amber: "from-amber-200/20 to-amber-400/5 text-amber-100/80",
    rose: "from-rose-200/20 to-rose-400/5 text-rose-100/80",
    violet: "from-violet-200/20 to-violet-400/5 text-violet-100/80",
    sky: "from-sky-200/20 to-sky-400/5 text-sky-100/80",
  }[glow];

  return (
    <div
      className={`rounded-full border border-white/10 bg-gradient-to-r ${glowClass} px-3 py-2 font-mono text-[10px] tracking-[0.24em]`}
    >
      <span className="text-white/40">{label}</span>
      <span className="ml-2 text-white/80">{value}</span>
    </div>
  );
}

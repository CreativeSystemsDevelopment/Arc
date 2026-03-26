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

function healthDot(status: HealthPayload["status"] | undefined) {
  if (status === "critical") return "bg-rose-400";
  if (status === "warning") return "bg-amber-300";
  return "bg-emerald-300";
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
  const modelLabel = meta?.identity.model?.split(":").pop() ?? "runtime";
  const trimmedThread = activeThread?.title?.trim() || "Untitled";

  return (
    <motion.header
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none fixed inset-x-0 top-0 z-30 px-3 pt-3 sm:px-4 sm:pt-4"
    >
      <div className="flex w-full flex-col gap-3 rounded-[1.35rem] border border-white/10 bg-[rgba(7,11,19,0.72)] px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-white/58 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
        <div className="pointer-events-auto flex min-w-0 items-center gap-4">
          <div className="space-y-1">
            <p className="font-mono text-[10px] tracking-[0.3em] text-white/38">
              {meta?.identity.subtitle ?? "Agent of Agents"}
            </p>
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate text-base font-semibold normal-case tracking-[0.08em] text-white/92">
                {meta?.identity.name ?? "Arc"}
              </h1>
              <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.22em] text-white/48">
                {modelLabel}
              </span>
            </div>
          </div>

          <div className="hidden h-8 w-px bg-white/10 md:block" />

          <div className="hidden min-w-[220px] gap-2 md:flex md:flex-col">
            <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.22em] text-white/40">
              <span>{orbLabel(orbMode)}</span>
              <span>{contextPercent}% context</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className={`h-full rounded-full bg-gradient-to-r ${meterTone(contextPercent)}`}
                animate={{ width: `${Math.max(contextPercent, 4)}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-2 md:justify-end">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-white/52">
            <span className={`h-2 w-2 rounded-full ${healthDot(health?.status)}`} />
            <span>{health?.status ?? "syncing"}</span>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-white/52">
            {subagentEchos.length > 0 ? `${subagentEchos.length} active` : "APCMS off"}
          </div>
          <button
            type="button"
            onClick={onOpenThreads}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-white/62 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white"
          >
            {trimmedThread.length > 22 ? `${trimmedThread.slice(0, 22)}…` : trimmedThread}
          </button>
          <button
            type="button"
            onClick={() => onOpenOverlay("skills")}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-white/62 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white"
          >
            Skills
          </button>
          <button
            type="button"
            onClick={() => onOpenOverlay("config")}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-white/62 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white"
          >
            Config
          </button>
        </div>
      </div>
    </motion.header>
  );
}

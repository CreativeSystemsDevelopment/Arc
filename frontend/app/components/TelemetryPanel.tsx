"use client";

import { motion } from "framer-motion";

import type { HealthPayload, RuntimeNotice, UiIdentity } from "./types";

interface TelemetryPanelProps {
  identity: UiIdentity | null;
  health: HealthPayload | null;
  connectionStatus: "connected" | "connecting" | "offline";
  contextRatio: number;
  isStreaming: boolean;
  runtimeNotices: RuntimeNotice[];
}

function metricTone(value: number, warning: number, danger: number) {
  if (value >= danger) return "text-rose-300";
  if (value >= warning) return "text-amber-200";
  return "text-slate-100";
}

export function TelemetryPanel({
  identity,
  health,
  connectionStatus,
  contextRatio,
  isStreaming,
  runtimeNotices,
}: TelemetryPanelProps) {
  const snapshot = health?.snapshot;
  const cpu = snapshot?.cpu_percent ?? 0;
  const memory = snapshot?.memory.percent ?? 0;
  const disk = snapshot?.disk.percent_used ?? 0;

  return (
    <motion.aside
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      animate={{
        opacity: 1,
        y: [0, -6, 0],
        scale: [1, 1.01, 1],
      }}
      exit={{ opacity: 0, y: 28, scale: 0.98 }}
      transition={{
        opacity: { duration: 0.5, ease: [0.2, 1, 0.22, 1] },
        y: { duration: 10, repeat: Infinity, ease: "easeInOut" },
        scale: { duration: 10, repeat: Infinity, ease: "easeInOut" },
      }}
      className="pointer-events-auto absolute right-4 top-28 z-20 w-[min(24rem,calc(100vw-2rem))]"
    >
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/30 p-4 text-white shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        <motion.div
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/55 to-transparent"
          animate={{ opacity: [0.2, 0.8, 0.2], scaleX: [0.8, 1, 0.8] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -left-8 top-8 h-40 w-40 rounded-full bg-violet-300/10 blur-3xl"
          animate={{ opacity: [0.18, 0.32, 0.18], x: [0, 10, 0], y: [0, 12, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/40">
              Summoned telemetry
            </p>
            <h2 className="mt-2 font-serif text-2xl text-white/90">
              {identity?.name ?? "Arc"}
            </h2>
            <p className="mt-1 text-sm text-white/45">
              {identity?.model ?? "Awaiting runtime metadata"}
            </p>
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-white/50">
            {isStreaming ? "active" : "dormant"}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            {
              label: "CPU",
              value: `${cpu.toFixed(0)}%`,
              tone: metricTone(cpu, 70, 90),
            },
            {
              label: "Memory",
              value: `${memory.toFixed(0)}%`,
              tone: metricTone(memory, 75, 90),
            },
            {
              label: "Disk",
              value: `${disk.toFixed(0)}%`,
              tone: metricTone(disk, 82, 92),
            },
            {
              label: "Link",
              value: connectionStatus,
              tone:
                connectionStatus === "connected"
                  ? "text-emerald-200"
                  : connectionStatus === "connecting"
                    ? "text-amber-200"
                    : "text-rose-300",
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/35">
                {metric.label}
              </p>
              <p className={`mt-2 font-serif text-2xl ${metric.tone}`}>
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-white/8 bg-white/4 p-3">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.28em] text-white/35">
            <span>Context pressure</span>
            <span>{Math.round(contextRatio * 100)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-400/60 via-cyan-300/70 to-white/90"
              animate={{
                width: `${Math.max(contextRatio * 100, 2)}%`,
                opacity: [0.75, 1, 0.75],
              }}
              transition={{
                width: { duration: 0.5, ease: "easeOut" },
                opacity: { duration: 3.4, repeat: Infinity, ease: "easeInOut" },
              }}
            />
          </div>
        </div>

        {runtimeNotices.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-white/8 bg-white/4 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/35">
              Chamber notices
            </div>
            <div className="mt-3 space-y-2">
              {runtimeNotices.slice(0, 4).map((notice) => (
                <div
                  key={notice.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-white/6 bg-black/15 px-3 py-2"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/42">
                    {notice.label}
                  </span>
                  <span className="text-right text-xs leading-5 text-white/62">
                    {notice.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {snapshot && (
          <div className="mt-4 flex items-center justify-between text-[11px] text-white/38">
            <span>Load {snapshot.load_avg_1m_5m_15m.map((entry) => entry.toFixed(1)).join(" / ")}</span>
            <span>{new Date(snapshot.timestamp).toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </motion.aside>
  );
}

"use client";

import { motion } from "framer-motion";

import type { ToolCall } from "./types";

interface ToolFilamentProps {
  tools: ToolCall[];
}

const TOOL_COPY: Record<ToolCall["status"], string> = {
  pending: "pending",
  running: "executing",
  completed: "stabilized",
  error: "fractured",
};

function toolStatusClasses(status: ToolCall["status"]) {
  switch (status) {
    case "running":
      return "border-cyan-400/35 bg-cyan-400/10 text-cyan-100";
    case "completed":
      return "border-emerald-400/30 bg-emerald-400/8 text-emerald-100";
    case "error":
      return "border-rose-400/35 bg-rose-400/10 text-rose-100";
    case "pending":
    default:
      return "border-white/12 bg-white/6 text-zinc-100";
  }
}

function formatPreview(tool: ToolCall) {
  const argEntries = Object.entries(tool.args ?? {});
  if (tool.result) {
    return tool.result.slice(0, 120);
  }
  if (argEntries.length === 0) {
    return "Awaiting runtime payload.";
  }
  if (argEntries.length === 1 && typeof argEntries[0]?.[1] === "string") {
    return String(argEntries[0][1]).slice(0, 120);
  }
  return JSON.stringify(tool.args).slice(0, 120);
}

export function ToolFilament({ tools }: ToolFilamentProps) {
  if (tools.length === 0) {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 36, filter: "blur(16px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 18, filter: "blur(12px)" }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto absolute right-5 top-[25vh] z-20 w-[min(26rem,32vw)]"
    >
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_40%),rgba(8,12,24,0.68)] p-5 shadow-[0_30px_120px_rgba(2,6,23,0.65)] backdrop-blur-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.42em] text-cyan-100/65">
              Tool filament
            </p>
            <h2 className="font-serif text-2xl text-white">Operational lifecycles</h2>
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1 text-[0.7rem] uppercase tracking-[0.24em] text-zinc-300/72">
            {tools.length} nodes
          </div>
        </div>

        <div className="relative pl-6">
          <div className="absolute bottom-4 left-[0.62rem] top-4 w-px bg-gradient-to-b from-white/35 via-cyan-200/35 to-white/0" />
          <div className="space-y-4">
            {tools.map((tool, index) => (
              <motion.article
                key={tool.id}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                className={`relative rounded-[1.35rem] border px-4 py-3 shadow-[0_20px_60px_rgba(2,6,23,0.28)] ${toolStatusClasses(tool.status)}`}
              >
                <span className="absolute left-[-1.9rem] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/35 bg-[radial-gradient(circle,rgba(255,255,255,0.95),rgba(255,255,255,0.1))]" />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[0.78rem] text-white/90">{tool.name}</p>
                    <p className="text-[0.62rem] uppercase tracking-[0.28em] text-current/70">
                      {TOOL_COPY[tool.status]}
                    </p>
                  </div>
                  <div className="rounded-full border border-current/15 px-2 py-1 text-[0.62rem] uppercase tracking-[0.24em] text-current/75">
                    {tool.node ?? "main"}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/80">
                  {formatPreview(tool)}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

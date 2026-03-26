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
      className="pointer-events-auto w-full max-w-sm"
    >
      <div className="relative overflow-hidden rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,20,0.84),rgba(7,11,18,0.76))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.38em] text-white/36">
              Tool activity
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[0.02em] text-white/92">
              Runtime calls
            </h2>
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1 text-[0.68rem] uppercase tracking-[0.22em] text-white/46">
            {tools.length} calls
          </div>
        </div>

        <div className="relative pl-6">
          <div className="absolute bottom-4 left-[0.62rem] top-4 w-px bg-gradient-to-b from-white/28 via-white/18 to-white/0" />
          <div className="space-y-4">
            {tools.map((tool, index) => (
              <motion.article
                key={tool.id}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                className={`relative rounded-[1.35rem] border px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.18)] ${toolStatusClasses(tool.status)}`}
              >
                <span className="absolute left-[-1.9rem] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/35 bg-[radial-gradient(circle,rgba(255,255,255,0.95),rgba(255,255,255,0.1))]" />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[0.74rem] text-white/88">{tool.name}</p>
                    <p className="text-[0.6rem] uppercase tracking-[0.24em] text-current/68">
                      {TOOL_COPY[tool.status]}
                    </p>
                  </div>
                  <div className="rounded-full border border-current/15 px-2 py-1 text-[0.6rem] uppercase tracking-[0.22em] text-current/74">
                    {tool.node ?? "main"}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/74">
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

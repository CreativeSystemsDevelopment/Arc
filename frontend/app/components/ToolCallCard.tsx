"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: "running" | "completed" | "error";
}

const TOOL_ICONS: Record<string, string> = {
  internet_search_tool: "search",
  internet_search: "search",
  write_todos: "list",
  read_file: "file",
  write_file: "pencil",
  edit_file: "edit",
  ls: "folder",
  glob: "search",
  grep: "search",
  execute: "terminal",
  task: "layers",
};

const TOOL_COLORS: Record<string, string> = {
  search: "text-blue-400",
  list: "text-yellow-400",
  file: "text-green-400",
  pencil: "text-purple-400",
  edit: "text-purple-400",
  folder: "text-amber-400",
  terminal: "text-cyan-400",
  layers: "text-emerald-400",
};

function ToolIcon({ name }: { name: string }) {
  const icon = TOOL_ICONS[name] || "cog";
  const color = TOOL_COLORS[icon] || "text-zinc-400";

  const icons: Record<string, React.ReactNode> = {
    search: (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
    ),
    list: (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M9 5h11M9 12h11M9 19h11M5 5v.01M5 12v.01M5 19v.01" />
      </svg>
    ),
    file: (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" />
      </svg>
    ),
    pencil: (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    ),
    edit: (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
      </svg>
    ),
    folder: (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
    ),
    terminal: (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" />
      </svg>
    ),
    layers: (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <polygon points="12 2 2 7 12 12 22 7" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
      </svg>
    ),
    cog: (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    ),
  };

  return icons[icon] || icons.cog;
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  if (entries.length === 1) {
    const [, v] = entries[0];
    if (typeof v === "string" && v.length < 80) return v;
  }
  return JSON.stringify(args, null, 2);
}

interface ToolCallCardProps {
  toolCall: ToolCall;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors"
      >
        <ToolIcon name={toolCall.name} />

        <span className="flex-1 truncate font-mono text-xs text-zinc-300">
          {toolCall.name}
        </span>

        {toolCall.status === "running" ? (
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-blue-400"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        ) : toolCall.status === "error" ? (
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        )}

        <svg
          className={`h-3 w-3 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800 px-3 py-2 space-y-2">
              {Object.keys(toolCall.args).length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Arguments
                  </span>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-[11px] text-zinc-400 font-mono">
                    {formatArgs(toolCall.args)}
                  </pre>
                </div>
              )}
              {toolCall.result && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Result
                  </span>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-[11px] text-zinc-400 font-mono whitespace-pre-wrap">
                    {toolCall.result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

"use client";

import { AnimatePresence, motion } from "framer-motion";

import { ArcMarkdown } from "./ArcMarkdown";
import type { ArcMessage } from "./types";

interface DecayStreamProps {
  messages: ArcMessage[];
  onPin: (messageId: string) => void;
}

function messageVisuals(message: ArcMessage) {
  const isUser = message.role === "user";
  if (message.pinned) {
    return {
      glow: "0 0 0 1px rgba(221,214,254,0.35), 0 0 36px rgba(167,139,250,0.22)",
      label: "Crystallized",
      className:
        "border border-violet-400/30 bg-white/[0.05] text-zinc-100 backdrop-blur-xl",
    };
  }
  if (isUser) {
    return {
      glow: "0 0 24px rgba(56,189,248,0.14)",
      label: "Operator",
      className:
        "border border-cyan-400/20 bg-cyan-300/[0.05] text-zinc-100 backdrop-blur-md",
    };
  }
  if (message.importance >= 0.75) {
    return {
      glow: "0 0 30px rgba(216,180,254,0.18)",
      label: "Architectural",
      className:
        "border border-violet-300/20 bg-violet-300/[0.045] text-zinc-100 backdrop-blur-md",
    };
  }
  return {
    glow: "0 0 20px rgba(148,163,184,0.08)",
    label: "Transient",
    className:
      "border border-white/8 bg-white/[0.03] text-zinc-200 backdrop-blur-md",
  };
}

export function DecayStream({ messages, onPin }: DecayStreamProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[26vh] z-20 mx-auto flex h-[42vh] w-full max-w-6xl items-start justify-center px-4">
      <div className="flex w-full max-w-4xl flex-col items-center gap-3">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => {
            const visuals = messageVisuals(message);
            return (
              <motion.article
                key={message.id}
                layout
                initial={{ opacity: 0, y: 22, scale: 0.98, filter: "blur(18px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -26, scale: 0.97, filter: "blur(20px)" }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className={`pointer-events-auto w-full max-w-3xl overflow-hidden rounded-[1.75rem] ${visuals.className}`}
                style={{
                  boxShadow: visuals.glow,
                  transformOrigin: "50% 0%",
                }}
              >
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3 text-[10px] uppercase tracking-[0.32em] text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
                    <span>{visuals.label}</span>
                    {message.node ? (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] tracking-[0.2em] text-zinc-500">
                        {message.node}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => onPin(message.id)}
                      className="rounded-full border border-white/10 px-2 py-1 text-[9px] tracking-[0.2em] text-zinc-300 transition hover:border-white/20 hover:text-white"
                    >
                      {message.pinned ? "Pinned" : "Crystallize"}
                    </button>
                  </div>
                </div>
                <div className="space-y-3 px-5 py-4">
                  <ArcMarkdown content={message.content || "Arc is gathering light..."} />
                  {message.toolCalls.length > 0 ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      {message.toolCalls.map((tool) => (
                        <div
                          key={tool.id}
                          className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3"
                        >
                          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                            <span>{tool.name}</span>
                            <span>{tool.status}</span>
                          </div>
                          <p className="line-clamp-3 text-xs leading-6 text-zinc-300">
                            {tool.result ||
                              JSON.stringify(tool.args).slice(0, 140) ||
                              "Awaiting output"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

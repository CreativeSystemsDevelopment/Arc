"use client";

import { motion } from "framer-motion";

import type { TodoItem } from "./types";

interface PlanConstellationProps {
  todos: TodoItem[];
  visible: boolean;
  onClose: () => void;
}

const STATUS_STYLE: Record<TodoItem["status"], string> = {
  pending: "border-white/15 bg-white/5 text-white/70",
  in_progress: "border-violet-300/40 bg-violet-300/12 text-violet-100",
  completed: "border-emerald-300/20 bg-emerald-300/8 text-emerald-100/75",
};

export function PlanConstellation({
  todos,
  visible,
  onClose,
}: PlanConstellationProps) {
  if (!visible || todos.length === 0) {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.2, 1, 0.22, 1] }}
      className="pointer-events-auto absolute left-8 top-[52vh] z-20 w-[min(30rem,calc(100vw-2.5rem))]"
    >
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(140,122,255,0.16),rgba(7,9,17,0.8)_68%)] p-5 shadow-[0_40px_120px_rgba(4,6,12,0.75)] backdrop-blur-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.44em] text-white/45">
              Todo constellation
            </p>
            <h2 className="font-['Playfair_Display'] text-2xl text-white">
              Arc&apos;s live plan
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/12 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.28em] text-white/45 transition hover:border-white/25 hover:text-white/80"
          >
            Recede
          </button>
        </div>

        <div className="space-y-4">
          {todos.map((todo, index) => (
            <motion.div
              key={todo.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.06 }}
              className="flex gap-3"
            >
              <div className="flex flex-col items-center">
                <span
                  className={`mt-1 h-3 w-3 rounded-full ${
                    todo.status === "completed"
                      ? "bg-emerald-300/70"
                      : todo.status === "in_progress"
                        ? "bg-violet-200 shadow-[0_0_18px_rgba(194,181,255,0.9)]"
                        : "bg-white/20"
                  }`}
                />
                {index < todos.length - 1 && (
                  <span className="mt-2 h-14 w-px bg-gradient-to-b from-white/30 to-transparent" />
                )}
              </div>

              <div
                className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 ${STATUS_STYLE[todo.status]}`}
              >
                <div className="mb-1 flex items-center justify-between gap-4">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.34em] text-white/50">
                    Node {String(index + 1).padStart(2, "0")}
                  </p>
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-white/45">
                    {todo.status.replace("_", " ")}
                  </p>
                </div>
                <p className="text-sm leading-6">{todo.content}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

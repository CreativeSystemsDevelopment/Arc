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
      className="pointer-events-auto h-full"
    >
      <div className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(11,15,24,0.88),rgba(7,10,17,0.8))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.34)] backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.34em] text-white/38">
              Active plan
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[0.04em] text-white">
              Current steps
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/12 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.22em] text-white/45 transition hover:border-white/25 hover:text-white/80"
          >
            Hide
          </button>
        </div>

        <div className="space-y-3">
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
                        ? "bg-violet-200 shadow-[0_0_14px_rgba(194,181,255,0.42)]"
                        : "bg-white/20"
                  }`}
                />
                {index < todos.length - 1 && (
                  <span className="mt-2 h-12 w-px bg-gradient-to-b from-white/24 to-transparent" />
                )}
              </div>

              <div
                className={`min-w-0 flex-1 rounded-[1.2rem] border px-4 py-3 ${STATUS_STYLE[todo.status]}`}
              >
                <div className="mb-1 flex items-center justify-between gap-4">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-white/44">
                    Step {String(index + 1).padStart(2, "0")}
                  </p>
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-white/42">
                    {todo.status.replace("_", " ")}
                  </p>
                </div>
                <p className="text-sm leading-6 text-white/82">{todo.content}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

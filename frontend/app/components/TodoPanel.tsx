"use client";

import { motion, AnimatePresence } from "framer-motion";

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

const STATUS_CONFIG = {
  pending: {
    icon: (
      <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
    label: "Pending",
    color: "text-zinc-400",
  },
  in_progress: {
    icon: (
      <motion.svg
        className="h-3.5 w-3.5 text-blue-400"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </motion.svg>
    ),
    label: "In Progress",
    color: "text-blue-400",
  },
  completed: {
    icon: (
      <svg className="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    label: "Done",
    color: "text-green-400",
  },
};

interface TodoPanelProps {
  todos: TodoItem[];
}

export function TodoPanel({ todos }: TodoPanelProps) {
  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === "completed").length;
  const progress = todos.length > 0 ? (completed / todos.length) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M9 5h11M9 12h11M9 19h11M5 5v.01M5 12v.01M5 19v.01" />
          </svg>
          <span className="text-xs font-semibold text-zinc-200">Plan</span>
        </div>
        <span className="text-[11px] text-zinc-500">
          {completed}/{todos.length} complete
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-zinc-800">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-500 to-green-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Todo items */}
      <div className="px-3 py-2 space-y-1">
        <AnimatePresence initial={false}>
          {todos.map((todo) => {
            const config = STATUS_CONFIG[todo.status];
            return (
              <motion.div
                key={todo.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
                  todo.status === "completed" ? "opacity-60" : ""
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
                <span
                  className={`text-xs leading-relaxed ${config.color} ${
                    todo.status === "completed" ? "line-through" : ""
                  }`}
                >
                  {todo.content}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

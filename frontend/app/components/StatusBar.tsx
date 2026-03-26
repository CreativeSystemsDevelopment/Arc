"use client";

import { motion, AnimatePresence } from "framer-motion";

type Status = "idle" | "planning" | "working" | "done";

const STATUS_CONFIG: Record<Status, { label: string; color: string; pulse: boolean }> = {
  idle: { label: "Ready", color: "bg-zinc-600", pulse: false },
  planning: { label: "Planning", color: "bg-yellow-400", pulse: true },
  working: { label: "Working", color: "bg-blue-400", pulse: true },
  done: { label: "Done", color: "bg-green-400", pulse: false },
};

export function StatusBar({ status }: { status: Status }) {
  const config = STATUS_CONFIG[status];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1"
      >
        <motion.span
          className={`h-1.5 w-1.5 rounded-full ${config.color}`}
          animate={
            config.pulse
              ? { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }
              : {}
          }
          transition={config.pulse ? { duration: 1, repeat: Infinity } : {}}
        />
        <span className="text-[11px] font-medium text-zinc-400">
          {config.label}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

"use client";

import { motion, AnimatePresence } from "framer-motion";

type Status = "idle" | "planning" | "working" | "done";

const STATUS_LABELS: Record<Status, string> = {
  idle: "",
  planning: "Planning…",
  working: "Working…",
  done: "Done",
};

const STATUS_COLORS: Record<Status, string> = {
  idle: "bg-zinc-700",
  planning: "bg-yellow-500",
  working: "bg-blue-500",
  done: "bg-green-500",
};

export function StatusBar({ status }: { status: Status }) {
  return (
    <AnimatePresence>
      {status !== "idle" && (
        <motion.div
          key={status}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2"
        >
          <motion.span
            className={`h-2 w-2 rounded-full ${STATUS_COLORS[status]}`}
            animate={status === "working" || status === "planning"
              ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }
              : {}}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-xs text-zinc-400">{STATUS_LABELS[status]}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

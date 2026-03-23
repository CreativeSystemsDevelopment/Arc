"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ToolCallLogProps {
  calls: string[];
}

export function ToolCallLog({ calls }: ToolCallLogProps) {
  if (calls.length === 0) return null;

  return (
    <motion.ul
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      initial="hidden"
      animate="show"
      className="mt-2 flex flex-col gap-1"
    >
      <AnimatePresence>
        {calls.map((call, i) => (
          <motion.li
            key={`${call}-${i}`}
            variants={{
              hidden: { opacity: 0, x: -8 },
              show: { opacity: 1, x: 0 },
            }}
            className="flex items-center gap-2 text-xs text-zinc-500"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
            <span className="font-mono">{call}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}

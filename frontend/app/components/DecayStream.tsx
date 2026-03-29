"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";

import { ArcMarkdown } from "./ArcMarkdown";
import type { ArcMessage } from "./types";

interface DecayStreamProps {
  messages: ArcMessage[];
  onPin: (messageId: string) => void;
}

const MAX_VISIBLE_MESSAGES = 3;

function messageVisuals(message: ArcMessage) {
  const isUser = message.role === "user";
  if (message.pinned) {
    return {
      label: "Pinned",
      accentColor: "rgba(221, 214, 254, 0.6)",
      textGlow: "0 0 20px rgba(221, 214, 254, 0.25)",
    };
  }
  if (isUser) {
    return {
      label: "You",
      accentColor: "rgba(34, 211, 238, 0.6)",
      textGlow: "0 0 16px rgba(34, 211, 238, 0.2)",
    };
  }
  if (message.importance >= 0.75) {
    return {
      label: "Arc",
      accentColor: "rgba(196, 181, 253, 0.6)",
      textGlow: "0 0 18px rgba(196, 181, 253, 0.22)",
    };
  }
  return {
    label: "Arc",
    accentColor: "rgba(255, 255, 255, 0.4)",
    textGlow: "0 0 14px rgba(255, 255, 255, 0.12)",
  };
}

export function DecayStream({ messages, onPin }: DecayStreamProps) {
  const prefersReducedMotion = useReducedMotion();

  // Limit to max visible messages for the stack effect
  const visibleMessages = messages.slice(-MAX_VISIBLE_MESSAGES);

  const messageVariants: Variants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.15 } },
      }
    : {
        hidden: {
          opacity: 0,
          y: 40,
          filter: "blur(8px)",
        },
        visible: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: {
            type: "spring" as const,
            stiffness: 400,
            damping: 30,
          },
        },
        exit: {
          opacity: 0,
          y: -50,
          filter: "blur(12px)",
          transition: {
            duration: 0.4,
            ease: "easeIn",
          },
        },
      };

  return (
    <div className="pointer-events-auto relative z-20 mx-auto flex min-h-full w-full flex-col justify-end px-4 pb-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <AnimatePresence initial={false} mode="popLayout">
          {visibleMessages.map((message, index) => {
            const visuals = messageVisuals(message);
            const isOldest = index === 0 && visibleMessages.length === MAX_VISIBLE_MESSAGES;
            const isNewest = index === visibleMessages.length - 1;

            // Fade oldest messages
            const positionOpacity = isOldest ? 0.5 : isNewest ? 1 : 0.75;

            return (
              <motion.div
                key={message.id}
                layout="position"
                variants={messageVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="relative w-full"
                style={{ 
                  transformOrigin: "50% 100%",
                  opacity: positionOpacity,
                }}
              >
                {/* Role indicator line + label */}
                <div className="mb-2 flex items-center gap-2">
                  <div
                    className="h-4 w-[2px] rounded-full"
                    style={{ backgroundColor: visuals.accentColor }}
                  />
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
                    {visuals.label}
                  </span>
                  {message.node && (
                    <span className="text-[8px] tracking-[0.16em] text-white/25">
                      {message.node}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPin(message.id)}
                      className="px-1 text-[8px] tracking-[0.16em] text-white/30 transition hover:text-white/60"
                    >
                      {message.pinned ? "Pinned" : "Pin"}
                    </button>
                  </div>
                </div>

                {/* Message content - appears directly on glass panel */}
                <div
                  className="prose-agent"
                  style={{
                    color: isOldest ? "rgba(237, 242, 255, 0.55)" : "rgba(237, 242, 255, 0.85)",
                    textShadow: isOldest ? "none" : visuals.textGlow,
                    filter: isOldest ? "blur(0.5px)" : "none",
                    transition: "all 0.3s ease",
                  }}
                >
                  <ArcMarkdown content={message.content} />
                </div>

                {/* Tool calls summary - compact to save stream real estate */}
                {message.toolCalls.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 px-1">
                    <div className="h-[6px] w-[6px] rounded-full bg-cyan-300/70 shadow-[0_0_10px_rgba(103,232,249,0.45)]" />
                    <p
                      className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40"
                      title={message.toolCalls.map((tool) => tool.name).join(", ")}
                    >
                      Executed {message.toolCalls.length} tool
                      {message.toolCalls.length === 1 ? "" : "s"}...
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty state */}
        {visibleMessages.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full flex-col items-center justify-center py-20"
          >
            <div className="text-center">
              <div className="mx-auto mb-4 h-px w-20 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/25">
                Awaiting transmission
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

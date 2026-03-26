"use client";

import { motion } from "framer-motion";
import { MarkdownContent } from "./MarkdownContent";
import { ToolCallCard, type ToolCall } from "./ToolCallCard";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[];
}

interface AgentMessageProps {
  message: Message;
}

export function AgentMessage({ message }: AgentMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[90%] ${
          isUser
            ? "rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm text-black"
            : "w-full space-y-3"
        }`}
      >
        {isUser ? (
          <span>{message.content}</span>
        ) : (
          <>
            {/* Tool calls */}
            {message.toolCalls.length > 0 && (
              <div className="space-y-1.5">
                {message.toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} />
                ))}
              </div>
            )}

            {/* AI text content */}
            {message.content ? (
              <div className="rounded-2xl rounded-bl-md bg-zinc-800/80 px-4 py-3">
                <MarkdownContent content={message.content} />
              </div>
            ) : message.toolCalls.length === 0 ? (
              <div className="rounded-2xl rounded-bl-md bg-zinc-800/80 px-4 py-3">
                <span className="inline-flex gap-1 text-zinc-500">
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                  >
                    &#9679;
                  </motion.span>
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                  >
                    &#9679;
                  </motion.span>
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                  >
                    &#9679;
                  </motion.span>
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </motion.div>
  );
}

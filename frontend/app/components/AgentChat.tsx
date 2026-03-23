"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentMessage } from "./AgentMessage";
import { ToolCallLog } from "./ToolCallLog";
import { StatusBar } from "./StatusBar";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
}

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<"idle" | "planning" | "working" | "done">("idle");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setStatus("planning");

    const assistantId = crypto.randomUUID();
    let assistantContent = "";

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", toolCalls: [] },
    ]);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"}/invoke/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: input, thread_id: "arc-session-1" }),
        }
      );

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      setStatus("working");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            setStatus("done");
            break;
          }

          try {
            const chunk = JSON.parse(data);
            const content =
              chunk?.agent?.messages?.[0]?.content ??
              chunk?.messages?.[0]?.content ?? "";

            if (content) {
              assistantContent += content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: assistantContent } : m
                )
              );
            }
          } catch {
            // ignore parse errors on partial chunks
          }
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      setStatus("idle");
    } finally {
      setIsStreaming(false);
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <h1 className="text-4xl font-bold tracking-tight text-white">Arc</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Archenemies Deep Agent · Complex, long-running, open-ended tasks
        </p>
      </motion.div>

      {/* Status bar */}
      <StatusBar status={status} />

      {/* Message list */}
      <div className="flex min-h-[400px] flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="m-auto text-sm text-zinc-600"
            >
              Ask Arc anything complex…
            </motion.p>
          )}
          {messages.map((m) => (
            <AgentMessage key={m.id} message={m} />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isStreaming}
          placeholder="What do you want Arc to do?"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-500 disabled:opacity-50"
        />
        <motion.button
          type="submit"
          disabled={isStreaming || !input.trim()}
          whileTap={{ scale: 0.97 }}
          className="rounded-lg bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-40"
        >
          {isStreaming ? "Working…" : "Run"}
        </motion.button>
      </form>
    </div>
  );
}

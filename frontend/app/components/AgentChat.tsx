"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentMessage } from "./AgentMessage";
import { TodoPanel, type TodoItem } from "./TodoPanel";
import { StatusBar } from "./StatusBar";
import type { ToolCall } from "./ToolCallCard";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[];
}

type AgentStatus = "idle" | "planning" | "working" | "done";

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [threadId] = useState(() => `arc-${crypto.randomUUID().slice(0, 8)}`);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, todos]);

  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus();
  }, [isStreaming]);

  const updateAssistantMessage = useCallback(
    (assistantId: string, updater: (msg: Message) => Message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? updater(m) : m))
      );
    },
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      toolCalls: [],
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setStatus("planning");
    setError(null);

    const assistantId = crypto.randomUUID();

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
          body: JSON.stringify({ message: input, thread_id: threadId }),
        }
      );

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              handleSSEEvent(currentEvent, parsed, assistantId);
            } catch {
              // partial JSON, skip
            }
            currentEvent = "";
          } else if (line === "") {
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setError(errMsg);
      setStatus("idle");
    } finally {
      setIsStreaming(false);
      if (status !== "idle") {
        setStatus("done");
        setTimeout(() => setStatus("idle"), 3000);
      }
    }
  }

  function handleSSEEvent(event: string, data: Record<string, unknown>, assistantId: string) {
    switch (event) {
      case "status": {
        const s = data.status as AgentStatus;
        if (s) setStatus(s);
        break;
      }

      case "message": {
        const content = data.content as string;
        if (content) {
          updateAssistantMessage(assistantId, (msg) => ({
            ...msg,
            content: msg.content + content,
          }));
        }
        break;
      }

      case "tool_call": {
        const tc: ToolCall = {
          id: (data.id as string) || crypto.randomUUID(),
          name: (data.name as string) || "unknown",
          args: (data.args as Record<string, unknown>) || {},
          status: "running",
        };
        updateAssistantMessage(assistantId, (msg) => ({
          ...msg,
          toolCalls: [...msg.toolCalls, tc],
        }));
        break;
      }

      case "tool_result": {
        const toolCallId = data.tool_call_id as string;
        const resultContent = (data.content as string) || "";
        updateAssistantMessage(assistantId, (msg) => ({
          ...msg,
          toolCalls: msg.toolCalls.map((tc) =>
            tc.id === toolCallId
              ? { ...tc, result: resultContent, status: "completed" as const }
              : tc
          ),
        }));
        break;
      }

      case "todos": {
        const rawTodos = data.todos;
        if (Array.isArray(rawTodos)) {
          const parsed: TodoItem[] = rawTodos.map((t: Record<string, string>, i: number) => ({
            id: t.id || String(i),
            content: t.content || t.title || t.task || String(t),
            status: (t.status as TodoItem["status"]) || "pending",
          }));
          setTodos(parsed);
        }
        break;
      }

      case "error": {
        const errMsg = data.error as string;
        setError(errMsg || "An error occurred");
        updateAssistantMessage(assistantId, (msg) => ({
          ...msg,
          toolCalls: msg.toolCalls.map((tc) =>
            tc.status === "running" ? { ...tc, status: "error" as const } : tc
          ),
        }));
        break;
      }

      case "done":
        setStatus("done");
        updateAssistantMessage(assistantId, (msg) => ({
          ...msg,
          toolCalls: msg.toolCalls.map((tc) =>
            tc.status === "running" ? { ...tc, status: "completed" as const } : tc
          ),
        }));
        break;
    }
  }

  function handleNewChat() {
    setMessages([]);
    setTodos([]);
    setError(null);
    setStatus("idle");
  }

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar - Todo panel */}
      <AnimatePresence>
        {todos.length > 0 && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex-shrink-0 overflow-hidden border-r border-zinc-800"
          >
            <div className="flex h-full w-80 flex-col p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-300">Agent Plan</h2>
                <span className="text-[11px] text-zinc-600">Thread: {threadId.slice(4)}</span>
              </div>
              <TodoPanel todos={todos} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">Arc</h1>
              <p className="text-[11px] text-zinc-500">Deep Agent</p>
            </div>
          </motion.div>

          <div className="flex items-center gap-3">
            <StatusBar status={status} />
            {messages.length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleNewChat}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                New chat
              </motion.button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-5">
            <AnimatePresence initial={false}>
              {messages.length === 0 && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center pt-32 text-center"
                >
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/20">
                    <svg className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-zinc-200">
                    What can I help you with?
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-zinc-500">
                    Arc is a deep agent built for complex, long-running tasks.
                    It can plan, research, write code, and execute multi-step workflows.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {[
                      "Research the latest AI trends",
                      "Build a Python CLI tool",
                      "Analyze a dataset",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setInput(suggestion)}
                        className="rounded-full border border-zinc-700 px-3.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {messages.map((m) => (
                <AgentMessage key={m.id} message={m} />
              ))}
            </AnimatePresence>

            {/* Error display */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3"
                >
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-red-300">Error</p>
                    <p className="mt-0.5 text-xs text-red-400/80">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-500 hover:text-red-300"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-zinc-800 px-6 py-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-3xl items-end gap-3"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isStreaming}
                placeholder="Ask Arc anything..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 pr-12 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/30 disabled:opacity-50 transition-colors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600">
                {isStreaming ? "" : "Enter ↵"}
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={isStreaming || !input.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-purple-500/10 disabled:opacity-40 disabled:shadow-none transition-opacity"
            >
              {isStreaming ? (
                <>
                  <motion.svg
                    className="h-4 w-4"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </motion.svg>
                  Working
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Run
                </>
              )}
            </motion.button>
          </form>
        </div>
      </div>
    </div>
  );
}

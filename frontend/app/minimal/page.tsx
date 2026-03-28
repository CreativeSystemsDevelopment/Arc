"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type MinimalMeta = {
  agent: string;
  model: string;
  transport: string;
  stream_path: string;
};

const DEFAULT_BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return { event, data: dataLines.join("\n") };
  }
}

export default function MinimalDebugPage() {
  const [meta, setMeta] = useState<MinimalMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId("system"),
      role: "system",
      content:
        "This page talks to a standalone docs-aligned Deep Agent route so we can isolate OpenRouter and Deep Agents behavior from the full Arc stack.",
    },
  ]);
  const [input, setInput] = useState("Reply with exactly hello.");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const assistantMessageIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      try {
        const response = await fetch(`${DEFAULT_BACKEND}/debug/minimal/meta`);
        if (!response.ok) {
          throw new Error(`Meta request failed with ${response.status}`);
        }
        const payload = (await response.json()) as MinimalMeta;
        if (!cancelled) {
          setMeta(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void loadMeta();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  function appendAssistantText(text: string) {
    if (!text) {
      return;
    }

    setMessages((current) => {
      if (!assistantMessageIdRef.current) {
        const id = makeId("assistant");
        assistantMessageIdRef.current = id;
        return [...current, { id, role: "assistant", content: text }];
      }

      return current.map((message) =>
        message.id === assistantMessageIdRef.current
          ? { ...message, content: `${message.content}${text}` }
          : message
      );
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isSending) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    assistantMessageIdRef.current = null;
    setIsSending(true);
    setStatus("connecting");
    setError(null);
    setMessages((current) => [
      ...current,
      { id: makeId("user"), role: "user", content: prompt },
    ]);

    try {
      const response = await fetch(`${DEFAULT_BACKEND}/debug/minimal/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          thread_id: makeId("thread"),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream request failed with ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const parsed = parseSseBlock(block);
          if (!parsed) {
            continue;
          }

          if (parsed.event === "status" && typeof parsed.data === "object" && parsed.data) {
            const nextStatus = (parsed.data as { status?: string }).status;
            if (nextStatus) {
              setStatus(nextStatus);
            }
            continue;
          }

          if (parsed.event === "message" && typeof parsed.data === "object" && parsed.data) {
            appendAssistantText(String((parsed.data as { content?: string }).content ?? ""));
            continue;
          }

          if (parsed.event === "error" && typeof parsed.data === "object" && parsed.data) {
            const payload = parsed.data as { error?: string };
            const nextError = payload.error ?? "Unknown stream error";
            setError(nextError);
            setStatus("error");
            continue;
          }

          if (parsed.event === "done") {
            setStatus("done");
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("aborted");
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    } finally {
      setIsSending(false);
    }
  }

  function stopStream() {
    abortRef.current?.abort();
    setIsSending(false);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1d2a3a,_#091018_58%)] px-4 py-10 text-stone-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">
            Deep Agents Quickstart Probe
          </p>
          <h1 className="mt-3 font-serif text-4xl text-white">
            Minimal OpenRouter Debug Chat
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-300">
            This route strips Arc down to a standalone Deep Agent that mirrors the
            LangChain quickstart pattern: a model string, one tiny tool, and plain
            SSE streaming.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Backend</p>
            <p className="mt-2 break-all text-sm text-stone-100">{DEFAULT_BACKEND}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Model</p>
            <p className="mt-2 break-all text-sm text-stone-100">
              {meta?.model ?? "Loading..."}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Status</p>
            <p className="mt-2 text-sm text-stone-100">{status}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/20">
          <div className="flex min-h-[420px] flex-col gap-3">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`rounded-2xl px-4 py-3 text-sm leading-7 ${
                  message.role === "user"
                    ? "ml-auto max-w-[80%] bg-cyan-500/15 text-cyan-50"
                    : message.role === "assistant"
                      ? "max-w-[85%] bg-white/8 text-stone-100"
                      : "max-w-full border border-amber-300/15 bg-amber-200/10 text-amber-50"
                }`}
              >
                <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-stone-400">
                  {message.role}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </article>
            ))}

            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                <p className="text-[11px] uppercase tracking-[0.22em] text-rose-200/80">
                  Error
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{error}</p>
              </div>
            ) : null}
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur"
        >
          <label className="mb-3 block text-xs uppercase tracking-[0.24em] text-stone-400">
            Prompt
          </label>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-cyan-300/40"
            placeholder="Ask the minimal agent something simple..."
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSending}
              className="rounded-full bg-cyan-300 px-5 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-cyan-500/50"
            >
              {isSending ? "Streaming..." : "Send"}
            </button>
            <button
              type="button"
              onClick={stopStream}
              disabled={!isSending}
              className="rounded-full border border-white/15 px-5 py-2 text-sm text-stone-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stop
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

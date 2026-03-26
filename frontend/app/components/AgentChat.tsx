"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CommandConduit } from "./CommandConduit";
import { DecayStream } from "./DecayStream";
import { DeepFocusOverlay } from "./DeepFocusOverlay";
import { OrbScene } from "./OrbScene";
import { OrbTopBar } from "./OrbTopBar";
import { PlanConstellation } from "./PlanConstellation";
import { TelemetryPanel } from "./TelemetryPanel";
import { ToolFilament } from "./ToolFilament";
import type {
  AgentStatus,
  ArcMessage,
  FilePreview,
  HealthPayload,
  OrbMode,
  OverlayKind,
  PanelKind,
  RuntimeNotice,
  SubagentEcho,
  ThreadRecord,
  TodoItem,
  ToolCall,
  UiMeta,
  WorkspacePayload,
} from "./types";

const STORAGE_KEY = "arc-orb-threads";
const MAX_VISIBLE_MESSAGES = 12;
const DEFAULT_CONTEXT_WINDOW = 200_000;
const EMPTY_MESSAGES: ArcMessage[] = [];
const EMPTY_TODOS: TodoItem[] = [];

function createThreadRecord(threadId?: string): ThreadRecord {
  const now = Date.now();
  return {
    id: threadId ?? `arc-${crypto.randomUUID().slice(0, 8)}`,
    title: "Untitled thread",
    createdAt: now,
    updatedAt: now,
    messages: [],
    todos: [],
  };
}

function deriveImportance(content: string, role: ArcMessage["role"]): number {
  const normalized = content.toLowerCase();
  const emphasis = ["warning", "critical", "architect", "error", "plan", "tool"];
  const bonus = emphasis.some((token) => normalized.includes(token)) ? 0.25 : 0;
  return Math.min(1, (role === "assistant" ? 0.45 : 0.3) + bonus + Math.min(content.length / 1200, 0.3));
}

function decayForMessage(content: string, role: ArcMessage["role"]): number {
  const importance = deriveImportance(content, role);
  return Date.now() + (importance > 0.55 ? 240_000 : 120_000);
}

function parseTodos(rawTodos: unknown): TodoItem[] {
  if (!Array.isArray(rawTodos)) return [];
  return rawTodos.map((todo, index) => {
    const entry = typeof todo === "object" && todo ? (todo as Record<string, unknown>) : {};
    return {
      id: String(entry.id ?? index),
      content: String(entry.content ?? entry.title ?? entry.task ?? todo ?? `Task ${index + 1}`),
      status: (entry.status as TodoItem["status"]) ?? "pending",
    };
  });
}

function loadThreads(): ThreadRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ThreadRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function AgentChat() {
  const prefersReducedMotion = useReducedMotion();
  const backendBaseUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
  const [manualReducedMotion, setManualReducedMotion] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [uiMeta, setUiMeta] = useState<UiMeta | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [selectedFile, setSelectedFile] = useState<FilePreview | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [panel, setPanel] = useState<PanelKind>("telemetry");
  const [runtimeNotices, setRuntimeNotices] = useState<RuntimeNotice[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subagentEchoes, setSubagentEchoes] = useState<SubagentEcho[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reducedMotion = Boolean(prefersReducedMotion) || manualReducedMotion;

  useEffect(() => {
    const stored = loadThreads();
    if (stored.length > 0) {
      setThreads(stored);
      setActiveThreadId(stored[0].id);
      return;
    }

    const initial = createThreadRecord();
    setThreads([initial]);
    setActiveThreadId(initial.id);
  }, []);

  useEffect(() => {
    if (threads.length === 0 || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  }, [threads]);

  const activeThread = useMemo(() => {
    return threads.find((thread) => thread.id === activeThreadId) ?? null;
  }, [threads, activeThreadId]);

  const messages = useMemo(
    () => activeThread?.messages ?? EMPTY_MESSAGES,
    [activeThread]
  );
  const todos = useMemo(
    () => activeThread?.todos ?? EMPTY_TODOS,
    [activeThread]
  );

  const contextUsage = useMemo(() => {
    const totalCharacters = messages.reduce(
      (sum, message) => sum + message.content.length + message.toolCalls.reduce((toolSum, tool) => toolSum + (tool.result?.length ?? 0), 0),
      0
    );
    const estimatedTokens = Math.round(totalCharacters / 4);
    const maxWindow = uiMeta?.topbar.context_window ?? DEFAULT_CONTEXT_WINDOW;
    return Math.min(100, Math.round((estimatedTokens / maxWindow) * 100));
  }, [messages, uiMeta]);

  const orbMode: OrbMode = useMemo(() => {
    if (error) return "error";
    if (status === "planning" || status === "working") return "thinking";
    if (isStreaming) return "answering";
    return "idle";
  }, [error, isStreaming, status]);

  const visibleMessages = useMemo(() => {
    return messages
      .filter((message) => message.pinned || message.decayAt > Date.now())
      .slice(-MAX_VISIBLE_MESSAGES);
  }, [messages]);

  const toolCalls = useMemo(() => {
    return messages.flatMap((message) => message.toolCalls).slice(-6);
  }, [messages]);

  const connectionStatus = useMemo(() => {
    if (error) return "offline" as const;
    if (uiMeta || health) return "connected" as const;
    return "connecting" as const;
  }, [error, health, uiMeta]);

  const activeSidebarCount = useMemo(
    () => todos.filter((todo) => todo.status === "in_progress").length,
    [todos]
  );
  const idleSuggestions = useMemo(
    () => [
      "Research the current Deep Agents runtime.",
      "Inspect the workspace and summarize the architecture.",
      "Plan the next UI manifestation phase.",
    ],
    []
  );

  const appendNotice = useCallback((label: string, value: string) => {
    setRuntimeNotices((current) => {
      const next = [
        { id: crypto.randomUUID(), label, value },
        ...current,
      ].slice(0, 6);
      return next;
    });
  }, []);

  const updateThread = useCallback(
    (threadId: string, updater: (thread: ThreadRecord) => ThreadRecord) => {
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId ? updater(thread) : thread
        )
      );
    },
    []
  );

  const createNewThread = useCallback((seed?: string) => {
    const next = createThreadRecord();
    if (seed) {
      next.title = seed.slice(0, 56);
    }
    setThreads((current) => [next, ...current]);
    setActiveThreadId(next.id);
    setSelectedFile(null);
    setSelectedFilePath(null);
    setError(null);
    setRuntimeNotices([]);
    setSubagentEchoes([]);
    setOverlay(null);
    setPanel("telemetry");
    return next.id;
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    const interval = window.setInterval(() => {
      setThreads((current) =>
        current.map((thread) => {
          if (thread.id !== activeThreadId) return thread;
          const now = Date.now();
          const filtered = thread.messages.filter(
            (message) => message.pinned || message.decayAt > now
          );
          if (filtered.length === thread.messages.length) return thread;
          return { ...thread, messages: filtered };
        })
      );
    }, 4000);

    return () => window.clearInterval(interval);
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) return;

    async function fetchUiBootstrap() {
      try {
        const [metaResponse, healthResponse] = await Promise.all([
          fetch(`${backendBaseUrl}/ui/meta`),
          fetch(`${backendBaseUrl}/ui/health`),
        ]);

        if (metaResponse.ok) {
          setUiMeta((await metaResponse.json()) as UiMeta);
        }

        if (healthResponse.ok) {
          setHealth((await healthResponse.json()) as HealthPayload);
        }
      } catch {
        // keep UI operational even without metadata
      }
    }

    void fetchUiBootstrap();
  }, [activeThreadId, backendBaseUrl]);

  const fetchWorkspace = useCallback(async () => {
    try {
      const response = await fetch(`${backendBaseUrl}/ui/workspace`);
      if (!response.ok) throw new Error("Unable to load workspace");
      const payload = (await response.json()) as WorkspacePayload;
      setWorkspace(payload);
      appendNotice("Overlay", "Workspace manifested");
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Unable to load workspace"
      );
    }
  }, [appendNotice, backendBaseUrl]);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch(`${backendBaseUrl}/ui/health`);
      if (!response.ok) throw new Error("Unable to refresh telemetry");
      const payload = (await response.json()) as HealthPayload;
      setHealth(payload);
      appendNotice("Telemetry", `VM ${payload.status}`);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Unable to refresh telemetry"
      );
    }
  }, [appendNotice, backendBaseUrl]);

  const openFile = useCallback(
    async (path: string) => {
      try {
        const response = await fetch(
          `${backendBaseUrl}/ui/file?path=${encodeURIComponent(path)}`
        );
        if (!response.ok) throw new Error("Unable to open file");
        const payload = (await response.json()) as FilePreview;
        setSelectedFile(payload);
        setSelectedFilePath(path);
        setOverlay("files");
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Unable to open file");
      }
    },
    [backendBaseUrl]
  );

  const setPinned = useCallback(
    (messageId: string, pinned: boolean) => {
      if (!activeThread) return;
      updateThread(activeThread.id, (thread) => ({
        ...thread,
        messages: thread.messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                pinned,
                decayAt: pinned ? Number.MAX_SAFE_INTEGER : decayForMessage(message.content, message.role),
              }
            : message
        ),
        updatedAt: Date.now(),
      }));
      appendNotice("Crystallization", pinned ? "Message pinned" : "Message released");
    },
    [activeThread, appendNotice, updateThread]
  );

  const handleSlashCommand = useCallback(
    async (command: string) => {
      switch (command) {
        case "/plan":
          setPanel("plan");
          appendNotice("Manifestation", "Plan constellation summoned");
          break;
        case "/tools":
          setPanel("tools");
          appendNotice("Manifestation", "Tool filament summoned");
          break;
        case "/telemetry":
        case "/health":
          setPanel("telemetry");
          await fetchHealth();
          break;
        case "/files":
          await fetchWorkspace();
          setOverlay("files");
          break;
        case "/skills":
          setOverlay("skills");
          break;
        case "/memories":
          setOverlay("memories");
          break;
        case "/config":
          setOverlay("config");
          break;
        case "/threads":
          setOverlay("threads");
          break;
        case "/tokens":
          appendNotice("Context", `${contextUsage}% of window in active use`);
          break;
        default:
          appendNotice("Command", `No handler for ${command}`);
      }
    },
    [appendNotice, contextUsage, fetchHealth, fetchWorkspace]
  );

  const updateAssistantMessage = useCallback(
    (
      threadId: string,
      assistantId: string,
      updater: (message: ArcMessage) => ArcMessage
    ) => {
      updateThread(threadId, (thread) => ({
        ...thread,
        updatedAt: Date.now(),
        messages: thread.messages.map((message) =>
          message.id === assistantId ? updater(message) : message
        ),
      }));
    },
    [updateThread]
  );

  const handleSseEvent = useCallback(
    (
      threadId: string,
      assistantId: string,
      event: string,
      data: Record<string, unknown>
    ) => {
      if (event === "status") {
        const nextStatus = data.status as AgentStatus;
        if (nextStatus) {
          setStatus(nextStatus);
          if (nextStatus === "planning") {
            setPanel("plan");
          }
          if (nextStatus === "working") {
            setPanel("tools");
          }
        }
        return;
      }

      if (event === "message") {
        const fragment = String(data.content ?? "");
        if (!fragment) return;
        updateAssistantMessage(threadId, assistantId, (message) => ({
          ...message,
          content: `${message.content}${fragment}`,
          node: String(data.node ?? message.node ?? ""),
          importance: deriveImportance(`${message.content}${fragment}`, "assistant"),
          decayAt: decayForMessage(`${message.content}${fragment}`, "assistant"),
        }));
        return;
      }

      if (event === "tool_call") {
        const toolCall: ToolCall = {
          id: String(data.id ?? crypto.randomUUID()),
          name: String(data.name ?? "tool"),
          args: (data.args as Record<string, unknown>) ?? {},
          status: "running",
          node: String(data.node ?? ""),
          createdAt: Date.now(),
        };

        updateAssistantMessage(threadId, assistantId, (message) => ({
          ...message,
          toolCalls: [...message.toolCalls, toolCall],
          decayAt: Date.now() + 300_000,
        }));

        if (toolCall.name === "task") {
          setSubagentEchoes((current) =>
            [
              {
                id: toolCall.id,
                name: String(
                  (toolCall.args.description as string) ??
                    toolCall.node ??
                    "Subagent"
                ),
                detail: String(
                  (toolCall.args.prompt as string) ??
                    "Delegated work materializing"
                ),
                status: "running" as const,
                createdAt: Date.now(),
              },
              ...current,
            ].slice(0, 4)
          );
        }
        return;
      }

      if (event === "tool_result") {
        const toolCallId = String(data.tool_call_id ?? "");
        const content = String(data.content ?? "");
        updateAssistantMessage(threadId, assistantId, (message) => ({
          ...message,
          toolCalls: message.toolCalls.map((toolCall) =>
            toolCall.id === toolCallId
              ? { ...toolCall, result: content, status: "completed" }
              : toolCall
          ),
          decayAt: Date.now() + 300_000,
        }));

        setSubagentEchoes((current) =>
          current.map((echo) =>
            echo.id === toolCallId ? { ...echo, status: "completed" } : echo
          )
        );
        return;
      }

      if (event === "todos") {
        const parsed = parseTodos(data.todos);
        updateThread(threadId, (thread) => ({
          ...thread,
          todos: parsed,
          updatedAt: Date.now(),
        }));
        setPanel("plan");
        return;
      }

      if (event === "error") {
        const nextError = String(data.error ?? "Unknown error");
        setError(nextError);
        setStatus("error");
        updateAssistantMessage(threadId, assistantId, (message) => ({
          ...message,
          toolCalls: message.toolCalls.map((toolCall) =>
            toolCall.status === "running"
              ? { ...toolCall, status: "error", result: nextError }
              : toolCall
          ),
          pinned: true,
        }));
        appendNotice("Failure", nextError);
        return;
      }

      if (event === "done") {
        setStatus("done");
        updateAssistantMessage(threadId, assistantId, (message) => ({
          ...message,
          toolCalls: message.toolCalls.map((toolCall) =>
            toolCall.status === "running"
              ? { ...toolCall, status: "completed" }
              : toolCall
          ),
          decayAt: Date.now() + 360_000,
        }));
        appendNotice("Flow", "Response crystallized");
      }
    },
    [appendNotice, updateAssistantMessage, updateThread]
  );

  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim() || isStreaming || !activeThread) return;

      const submittedValue = value.trim();
      if (submittedValue.startsWith("/")) {
        const command = submittedValue.split(/\s+/)[0]?.toLowerCase() ?? submittedValue;
        setInput("");
        await handleSlashCommand(command);
        return;
      }
      const now = Date.now();
      const userMessage: ArcMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: submittedValue,
        toolCalls: [],
        createdAt: now,
        decayAt: now + 300_000,
        pinned: false,
        importance: deriveImportance(submittedValue, "user"),
      };

      const assistantId = crypto.randomUUID();
      const assistantMessage: ArcMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
        createdAt: now + 1,
        decayAt: now + 300_000,
        pinned: false,
        importance: 0.55,
      };

      updateThread(activeThread.id, (thread) => ({
        ...thread,
        title: thread.messages.length === 0 ? submittedValue.slice(0, 56) : thread.title,
        updatedAt: now,
        messages: [...thread.messages, userMessage, assistantMessage],
      }));

      setInput("");
      setError(null);
      setIsStreaming(true);
      setStatus("planning");
      setPanel("plan");
      appendNotice("Command", "Prompt fed into the Orb");

      try {
        const response = await fetch(`${backendBaseUrl}/invoke/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: submittedValue, thread_id: activeThread.id }),
        });

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;

          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ") && currentEvent) {
              const data = line.slice(6);
              try {
                handleSseEvent(
                  activeThread.id,
                  assistantId,
                  currentEvent,
                  JSON.parse(data) as Record<string, unknown>
                );
              } catch {
                // ignore partial chunks
              }
              currentEvent = "";
            } else if (line === "") {
              currentEvent = "";
            }
          }
        }
      } catch (submitError) {
        const nextError =
          submitError instanceof Error ? submitError.message : "Unknown error";
        setError(nextError);
        setStatus("error");
        appendNotice("Failure", nextError);
      } finally {
        setIsStreaming(false);
        window.setTimeout(() => setStatus("idle"), 1800);
      }
    },
    [
      activeThread,
      appendNotice,
      backendBaseUrl,
      handleSlashCommand,
      handleSseEvent,
      isStreaming,
      updateThread,
    ]
  );

  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus();
    }
  }, [isStreaming]);

  return (
    <div className="arc-grid arc-abyss arc-chamber relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(84,70,190,0.24)_0%,rgba(10,12,20,0)_34%),linear-gradient(180deg,#04050a_0%,#070910_46%,#030409_100%)] text-white">
      <motion.div
        className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(122,106,219,0.08),transparent_24%,rgba(0,0,0,0.16)_100%)]"
        animate={
          reducedMotion
            ? { opacity: 1 }
            : { opacity: [0.9, 1, 0.92], scale: [1, 1.012, 1] }
        }
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_20%_18%,rgba(139,116,255,0.12),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(96,165,250,0.08),transparent_24%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.03),transparent_30%)]"
        animate={
          reducedMotion
            ? { opacity: 0.6 }
            : {
                opacity: [0.48, 0.66, 0.54],
                x: [0, 6, -4, 0],
                y: [0, -4, 2, 0],
              }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      <OrbTopBar
        meta={uiMeta}
        health={health}
        orbMode={orbMode}
        contextPercent={contextUsage}
        activeThread={activeThread}
        subagentEchos={subagentEchoes}
        onOpenThreads={() => setOverlay("threads")}
        onOpenOverlay={(kind) => setOverlay(kind)}
      />

      <div className="relative flex min-h-screen flex-col px-3 pb-28 pt-20 sm:px-4 sm:pt-24">
        <div className="absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-[44vh] sm:h-[48vh]">
            <OrbScene
              mode={orbMode}
              contextRatio={contextUsage / 100}
              echoes={subagentEchoes}
              reducedMotion={reducedMotion}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46vh] bg-[linear-gradient(180deg,rgba(3,5,9,0)_0%,rgba(2,4,8,0.08)_12%,rgba(3,5,9,0.68)_58%,rgba(0,0,0,0.96)_100%)]" />
          <div className="pointer-events-none absolute inset-x-[6%] bottom-0 h-[36vh] [clip-path:polygon(14%_0%,86%_0%,100%_100%,0%_100%)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01)_18%,rgba(9,11,18,0.58)_44%,rgba(0,0,0,0.96)_100%)] opacity-88" />
          <div className="pointer-events-none absolute inset-x-[10%] bottom-[10vh] h-px bg-[linear-gradient(to_right,transparent,rgba(210,220,255,0.24),transparent)]" />
        </div>

        <div className="relative z-10 grid min-h-[calc(100vh-8rem)] grid-cols-1 gap-3 xl:grid-cols-[22rem_minmax(0,1fr)_23rem]">
          <div className="hidden xl:block">
            <AnimatePresence mode="wait">
              {panel === "plan" ? (
                <PlanConstellation
                  key="plan-edge"
                  todos={todos}
                  visible={true}
                  onClose={() => setPanel("telemetry")}
                />
              ) : (
                <motion.aside
                  key="left-idle"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="glass-panel flex h-full min-h-[26rem] flex-col rounded-[1.8rem] p-4"
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/38">
                    Quick prompts
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    {idleSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setInput(suggestion)}
                        className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3 text-left text-sm text-white/66 transition hover:border-white/16 hover:bg-white/[0.06] hover:text-white/88"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </div>

          <div className="min-h-0">
            <div className="glass-panel relative flex h-full min-h-[26rem] flex-col overflow-hidden rounded-[1.8rem]">
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/34">
                    Conversation
                  </p>
                  <h2 className="mt-1 text-sm font-medium text-white/74">
                    {activeThread?.title ?? "Untitled thread"}
                  </h2>
                </div>
                <div className="rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-white/44">
                  {activeSidebarCount > 0 ? `${activeSidebarCount} active` : connectionStatus}
                </div>
              </div>

              <div className="relative flex-1 p-4">
                {visibleMessages.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: reducedMotion ? 0 : 18 }}
                    animate={
                      reducedMotion
                        ? { opacity: 1, y: 0 }
                        : { opacity: 1, y: [0, -3, 0] }
                    }
                    transition={{
                      opacity: { duration: 0.6 },
                      y: { duration: 10, repeat: Infinity, ease: "easeInOut" },
                    }}
                    className="pointer-events-auto flex h-full min-h-[22rem] flex-col items-center justify-end pb-24 text-center"
                  >
                    <div className="max-w-xl rounded-[1.4rem] border border-white/8 bg-black/18 px-5 py-4 backdrop-blur-md">
                      <p className="font-mono text-xs uppercase tracking-[0.28em] text-white/34">
                        Ready
                      </p>
                      <p className="mt-3 text-lg font-medium text-white/74">
                        Use the docked panels and input to work with Arc.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <DecayStream
                    messages={visibleMessages}
                    onPin={(messageId) => {
                      const target = messages.find((message) => message.id === messageId);
                      setPinned(messageId, !target?.pinned);
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0">
            <AnimatePresence mode="wait">
              {panel === "telemetry" && (
                <TelemetryPanel
                  key="telemetry"
                  identity={uiMeta?.identity ?? null}
                  health={health}
                  connectionStatus={connectionStatus}
                  contextRatio={contextUsage / 100}
                  isStreaming={isStreaming}
                  runtimeNotices={runtimeNotices}
                />
              )}
              {panel === "tools" && (
                <ToolFilament
                  key="tools"
                  tools={toolCalls}
                />
              )}
              {panel === "plan" && (
                <div className="xl:hidden">
                  <PlanConstellation
                    key="plan-mobile"
                    todos={todos}
                    visible={true}
                    onClose={() => setPanel("telemetry")}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <CommandConduit
          ref={inputRef}
          input={input}
          isStreaming={isStreaming}
          reducedMotion={reducedMotion}
          audioEnabled={audioEnabled}
          toggleReducedMotion={() =>
            setManualReducedMotion((current) => !current)
          }
          toggleAudio={() => setAudioEnabled((current) => !current)}
          commands={uiMeta?.slash_commands ?? []}
          setInput={setInput}
          onExecuteCommand={(command) => {
            void handleSlashCommand(command);
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit(input);
          }}
        />
      </div>

      <DeepFocusOverlay
        overlay={overlay}
        onClose={() => setOverlay(null)}
        workspaceRoot={workspace?.root ?? null}
        selectedPath={selectedFilePath}
        onSelectPath={openFile}
        filePreview={selectedFile}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={(threadId) => {
          setActiveThreadId(threadId);
          setOverlay(null);
          appendNotice("Thread", `Shifted to ${threadId}`);
        }}
        skills={uiMeta?.skills ?? null}
        memories={uiMeta?.memory_tiers ?? null}
        settings={uiMeta?.settings ?? null}
      />

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed right-4 top-24 z-50 max-w-sm rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-100 shadow-[0_0_40px_rgba(248,113,113,0.12)] backdrop-blur-xl"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-red-200/70">
              Failure Surge
            </div>
            <p className="mt-2 leading-6">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

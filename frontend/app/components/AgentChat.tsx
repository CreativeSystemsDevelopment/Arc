"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CommandConduit } from "./CommandConduit";
import { DecayStream } from "./DecayStream";
import { DeepFocusOverlay } from "./DeepFocusOverlay";
import { OrbScene } from "./OrbScene";
import { PlanConstellation } from "./PlanConstellation";
import { TelemetryPanel } from "./TelemetryPanel";
import { ToolFilament } from "./ToolFilament";
import type {
  AgentStatus,
  ArcMessage,
  FileAttachment,
  FilePreview,
  HealthPayload,
  OrbMode,
  OverlayKind,
  RuntimeNotice,
  RuntimeEventEnvelope,
  SubagentEcho,
  ThreadRecord,
  TodoItem,
  ToolCall,
  UiMeta,
  WorkspacePayload,
} from "./types";

const STORAGE_KEY = "arc-orb-threads";
const MAX_VISIBLE_MESSAGES = 3;
const DEFAULT_CONTEXT_WINDOW = 200_000;
const EMPTY_MESSAGES: ArcMessage[] = [];
const EMPTY_TODOS: TodoItem[] = [];
const MAX_RUNTIME_EVENTS = 400;
const MAX_TIMELINE_EVENTS = 14;
const LAST_SEEN_AT_KEY = "arc-last-seen-at";
const LAST_GREETING_AT_KEY = "arc-last-greeting-at";
const UI_SETTINGS_KEY = "arc-ui-settings-v1";
const AI_SETTINGS_KEY = "arc-ai-settings-v1";

type ChatFontSize = "small" | "medium" | "large";
type DockPanelId = "quick_prompts" | "plan" | "telemetry" | "tools";
type DockSlot = "left" | "right" | "hidden";

type PanelLayout = {
  slots: Record<DockSlot, DockPanelId[]>;
  active: {
    left: DockPanelId;
    right: DockPanelId;
  };
};

type UiSettings = {
  reducedMotion: boolean;
  audioEnabled: boolean;
  orbGlow: number;
  panelOpacity: number;
  chatFontSize: ChatFontSize;
  orbSpeed: number;
  orbDistortion: number;
  orbColors: boolean;
  showReflections: boolean;
  showParticles: boolean;
  ambientLight: number;
  maxVisibleMessages: number;
  panelLayout: PanelLayout;
};

type AiSettings = {
  greetingEnabled: boolean;
  greetingMinAwaySeconds: number;
  greetingCooldownSeconds: number;
  operatorName: string;
  greetingStyle: "adaptive" | "playful" | "professional" | "direct";
  greetingIncludeRecentWork: boolean;
  greetingMaxWords: number;
  autoFocusInput: boolean;
  smoothScroll: boolean;
};

const DEFAULT_UI_SETTINGS: UiSettings = {
  reducedMotion: false,
  audioEnabled: false,
  orbGlow: 1,
  panelOpacity: 0.8,
  chatFontSize: "medium",
  orbSpeed: 1,
  orbDistortion: 1,
  orbColors: true,
  showReflections: true,
  showParticles: true,
  ambientLight: 0.8,
  maxVisibleMessages: MAX_VISIBLE_MESSAGES,
  panelLayout: {
    slots: {
      left: ["quick_prompts", "plan"],
      right: ["telemetry", "tools"],
      hidden: [],
    },
    active: {
      left: "quick_prompts",
      right: "telemetry",
    },
  },
};

const DEFAULT_AI_SETTINGS: AiSettings = {
  greetingEnabled: true,
  greetingMinAwaySeconds: 120,
  greetingCooldownSeconds: 60,
  operatorName: "Shane",
  greetingStyle: "adaptive",
  greetingIncludeRecentWork: true,
  greetingMaxWords: 24,
  autoFocusInput: true,
  smoothScroll: true,
};

const DOCK_SLOT_ORDER: DockSlot[] = ["left", "right", "hidden"];
const SLOT_LABEL: Record<DockSlot, string> = {
  left: "Left dock",
  right: "Right dock",
  hidden: "Hidden",
};

const PANEL_LABEL: Record<DockPanelId, string> = {
  quick_prompts: "Quick prompts",
  plan: "Plan constellation",
  telemetry: "Telemetry",
  tools: "Tool filament",
};

const PANEL_ICON: Record<DockPanelId, string> = {
  quick_prompts: "✦",
  plan: "◈",
  telemetry: "○",
  tools: "⚡",
};

function sanitizePanelLayout(layout: PanelLayout | undefined): PanelLayout {
  const allPanels: DockPanelId[] = ["quick_prompts", "plan", "telemetry", "tools"];
  const normalizedSlots: Record<DockSlot, DockPanelId[]> = {
    left: [],
    right: [],
    hidden: [],
  };

  if (layout) {
    for (const slot of DOCK_SLOT_ORDER) {
      const source = Array.isArray(layout.slots?.[slot]) ? layout.slots[slot] : [];
      for (const panel of source) {
        if (allPanels.includes(panel) && !normalizedSlots.left.includes(panel) && !normalizedSlots.right.includes(panel) && !normalizedSlots.hidden.includes(panel)) {
          normalizedSlots[slot].push(panel);
        }
      }
    }
  }

  for (const panel of allPanels) {
    if (
      !normalizedSlots.left.includes(panel) &&
      !normalizedSlots.right.includes(panel) &&
      !normalizedSlots.hidden.includes(panel)
    ) {
      normalizedSlots.hidden.push(panel);
    }
  }

  if (normalizedSlots.left.length === 0) {
    const fallback = normalizedSlots.hidden.shift();
    if (fallback) normalizedSlots.left.push(fallback);
  }
  if (normalizedSlots.right.length === 0) {
    const fallback = normalizedSlots.hidden.shift();
    if (fallback) normalizedSlots.right.push(fallback);
  }

  const leftActive =
    layout?.active?.left && normalizedSlots.left.includes(layout.active.left)
      ? layout.active.left
      : normalizedSlots.left[0];
  const rightActive =
    layout?.active?.right && normalizedSlots.right.includes(layout.active.right)
      ? layout.active.right
      : normalizedSlots.right[0];

  return {
    slots: normalizedSlots,
    active: {
      left: leftActive,
      right: rightActive,
    },
  };
}

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

function createGreetingMessage(content: string): ArcMessage {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    toolCalls: [],
    createdAt: now,
    decayAt: now + 360_000,
    pinned: false,
    importance: deriveImportance(content, "assistant"),
  };
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

function parseRuntimeEvent(
  input: Record<string, unknown>
): RuntimeEventEnvelope | null {
  const eventId = input.event_id;
  const seq = input.seq;
  const ts = input.ts;
  const runId = input.run_id;
  const threadId = input.thread_id;
  const scope = input.scope;
  const type = input.type;
  const severity = input.severity;
  const signalClass = input.signal_class;
  const legacyEvent = input.legacy_event;
  const payload = input.payload;

  if (
    typeof eventId !== "string" ||
    typeof seq !== "number" ||
    typeof ts !== "number" ||
    typeof runId !== "string" ||
    typeof threadId !== "string" ||
    typeof scope !== "string" ||
    typeof type !== "string" ||
    (severity !== "info" && severity !== "warn" && severity !== "error") ||
    typeof legacyEvent !== "string" ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }

  return {
    event_id: eventId,
    seq,
    ts,
    run_id: runId,
    thread_id: threadId,
    scope,
    type,
    severity,
    signal_class: typeof signalClass === "string" ? signalClass : undefined,
    legacy_event: legacyEvent,
    payload: payload as Record<string, unknown>,
  };
}

function signalClassFromRuntimeEvent(event: RuntimeEventEnvelope): string {
  if (event.signal_class) return event.signal_class;
  if (event.type === "status" || event.type === "message") {
    return "model_lifecycle";
  }
  if (event.type === "tool_call" || event.type === "tool_result") {
    return "tool_lifecycle";
  }
  if (
    event.type === "error" ||
    event.type === "done" ||
    event.scope === "backend"
  ) {
    return "backend_transport";
  }
  return "unknown";
}

export function AgentChat() {
  const prefersReducedMotion = useReducedMotion();
  const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_BACKEND_URL is required. No fallback backend URL is allowed."
    );
  }
  const [uiSettings, setUiSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const uiSettingsPersistReadyRef = useRef(false);
  const aiSettingsPersistReadyRef = useRef(false);

  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [uiMeta, setUiMeta] = useState<UiMeta | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [selectedFile, setSelectedFile] = useState<FilePreview | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [layoutDraft, setLayoutDraft] = useState<PanelLayout | null>(null);
  const [showUiSettings, setShowUiSettings] = useState(false);
  const [runtimeNotices, setRuntimeNotices] = useState<RuntimeNotice[]>([]);
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeEventEnvelope[]>([]);
  const [runtimeGapCount, setRuntimeGapCount] = useState(0);
  const [coverageMissingCount, setCoverageMissingCount] = useState(0);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null);
  const [resumeAckCount, setResumeAckCount] = useState(0);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subagentEchoes, setSubagentEchoes] = useState<SubagentEcho[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const lastSeqByRunRef = useRef<Map<string, number>>(new Map());
  const reducedMotion = Boolean(prefersReducedMotion) || uiSettings.reducedMotion;

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
    if (typeof window === "undefined") return;
    try {
      const uiRaw = window.localStorage.getItem(UI_SETTINGS_KEY);
      if (uiRaw) {
        const parsed = JSON.parse(uiRaw) as Partial<UiSettings>;
        setUiSettings({
          ...DEFAULT_UI_SETTINGS,
          ...parsed,
          panelLayout: sanitizePanelLayout(parsed.panelLayout as PanelLayout | undefined),
        });
      }
      const aiRaw = window.localStorage.getItem(AI_SETTINGS_KEY);
      if (aiRaw) {
        const parsed = JSON.parse(aiRaw) as Partial<AiSettings>;
        setAiSettings({ ...DEFAULT_AI_SETTINGS, ...parsed });
      }
    } catch {
      // Keep defaults if storage is malformed.
    } finally {
      setSettingsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !settingsHydrated) return;
    if (!uiSettingsPersistReadyRef.current) {
      uiSettingsPersistReadyRef.current = true;
      return;
    }
    window.localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(uiSettings));
  }, [settingsHydrated, uiSettings]);

  useEffect(() => {
    if (typeof window === "undefined" || !settingsHydrated) return;
    if (!aiSettingsPersistReadyRef.current) {
      aiSettingsPersistReadyRef.current = true;
      return;
    }
    window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(aiSettings));
  }, [aiSettings, settingsHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sendPresence = (state: "connected" | "disconnected" | "hidden" | "visible", detail?: string) => {
      fetch(`${backendBaseUrl}/ui/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, source: "ui", detail }),
        keepalive: true,
      }).catch(() => {
        // Non-blocking telemetry signal.
      });
    };
    const stampNow = () => {
      window.localStorage.setItem(LAST_SEEN_AT_KEY, String(Date.now()));
    };
    sendPresence("connected");
    const onBeforeUnload = () => {
      stampNow();
      sendPresence("disconnected", "beforeunload");
    };
    const onVisibilityChange = () => {
      stampNow();
      sendPresence(document.visibilityState === "hidden" ? "hidden" : "visible");
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stampNow();
      sendPresence("disconnected", "unmount");
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [backendBaseUrl]);

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
    if (status === "done") return "paused";
    return "idle";
  }, [error, isStreaming, status]);

  const visibleMessages = useMemo(() => {
    return messages
      .filter((message) => message.pinned || message.decayAt > Date.now())
      .slice(-Math.max(1, uiSettings.maxVisibleMessages));
  }, [messages, uiSettings.maxVisibleMessages]);

  const toolCalls = useMemo(() => {
    return messages.flatMap((message) => message.toolCalls).slice(-6);
  }, [messages]);

  const requiredSignalClasses = useMemo(() => {
    const rawCoverage = uiMeta?.telemetry?.coverage ?? {};
    return Object.keys(rawCoverage);
  }, [uiMeta]);

  const observedSignalClasses = useMemo(() => {
    const classes = new Set<string>();
    for (const runtimeEvent of runtimeEvents) {
      classes.add(signalClassFromRuntimeEvent(runtimeEvent));
    }
    return classes;
  }, [runtimeEvents]);

  const observedSignalClassList = useMemo(
    () => Array.from(observedSignalClasses).sort(),
    [observedSignalClasses]
  );

  const missingSignalClasses = useMemo(() => {
    if (requiredSignalClasses.length === 0) return [];
    return requiredSignalClasses.filter(
      (signalClass) => !observedSignalClasses.has(signalClass)
    );
  }, [observedSignalClasses, requiredSignalClasses]);

  const frameworkTimeline = useMemo(() => {
    return runtimeEvents.slice(0, MAX_TIMELINE_EVENTS);
  }, [runtimeEvents]);

  const latestRuntimeCursor = useMemo(() => {
    if (runtimeEvents.length === 0) return null;
    const [latest] = runtimeEvents;
    return { event_id: latest.event_id, seq: latest.seq };
  }, [runtimeEvents]);

  const runtimeHeartbeatAgeMs = lastHeartbeatAt
    ? Date.now() - lastHeartbeatAt
    : null;

  // Panel auto-minimize state
  const [leftMinimized, setLeftMinimized] = useState(false);
  const [rightMinimized, setRightMinimized] = useState(false);
  const [leftHovered, setLeftHovered] = useState(false);
  const [rightHovered, setRightHovered] = useState(false);

  const leftPanels = uiSettings.panelLayout.slots.left;
  const rightPanels = uiSettings.panelLayout.slots.right;
  const leftActivePanel = leftPanels.includes(uiSettings.panelLayout.active.left)
    ? uiSettings.panelLayout.active.left
    : leftPanels[0] ?? "quick_prompts";
  const rightActivePanel = rightPanels.includes(uiSettings.panelLayout.active.right)
    ? uiSettings.panelLayout.active.right
    : rightPanels[0] ?? "telemetry";

  const setDockActivePanel = useCallback((slot: "left" | "right", panelId: DockPanelId) => {
    setUiSettings((current) => {
      if (!current.panelLayout.slots[slot].includes(panelId)) return current;
      return {
        ...current,
        panelLayout: {
          ...current.panelLayout,
          active: {
            ...current.panelLayout.active,
            [slot]: panelId,
          },
        },
      };
    });
  }, []);

  const activatePanelById = useCallback(
    (panelId: DockPanelId): boolean => {
      if (leftPanels.includes(panelId)) {
        setDockActivePanel("left", panelId);
        setLeftMinimized(false);
        return true;
      }
      if (rightPanels.includes(panelId)) {
        setDockActivePanel("right", panelId);
        setRightMinimized(false);
        return true;
      }
      return false;
    },
    [leftPanels, rightPanels, setDockActivePanel]
  );

  useEffect(() => {
    if (!showUiSettings) return;
    setLayoutDraft(JSON.parse(JSON.stringify(uiSettings.panelLayout)) as PanelLayout);
  }, [showUiSettings, uiSettings.panelLayout]);

  const moveDraftPanel = useCallback(
    (panelId: DockPanelId, targetSlot: DockSlot) => {
      setLayoutDraft((current) => {
        const source = sanitizePanelLayout(current ?? uiSettings.panelLayout);
        const next: PanelLayout = {
          slots: {
            left: source.slots.left.filter((id) => id !== panelId),
            right: source.slots.right.filter((id) => id !== panelId),
            hidden: source.slots.hidden.filter((id) => id !== panelId),
          },
          active: { ...source.active },
        };
        next.slots[targetSlot].push(panelId);
        const sanitized = sanitizePanelLayout(next);
        return sanitized;
      });
    },
    [uiSettings.panelLayout]
  );

  const savePanelLayoutAndRefresh = useCallback(() => {
    if (!layoutDraft) return;
    const sanitized = sanitizePanelLayout(layoutDraft);
    setUiSettings((current) => ({
      ...current,
      panelLayout: sanitized,
    }));
    setShowUiSettings(false);
    window.setTimeout(() => window.location.reload(), 120);
  }, [layoutDraft]);

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

  const appendRuntimeEvent = useCallback((runtimeEvent: RuntimeEventEnvelope) => {
    setRuntimeEvents((current) =>
      [runtimeEvent, ...current].slice(0, MAX_RUNTIME_EVENTS)
    );
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
    setUiSettings((current) => ({
      ...current,
      panelLayout: {
        ...current.panelLayout,
        active: {
          ...current.panelLayout.active,
          right: current.panelLayout.slots.right.includes("telemetry")
            ? "telemetry"
            : current.panelLayout.slots.right[0] ?? current.panelLayout.active.right,
        },
      },
    }));
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

        if (typeof window !== "undefined") {
          const now = Date.now();
          const lastSeenRaw = window.localStorage.getItem(LAST_SEEN_AT_KEY);
          const lastSeenAt = lastSeenRaw ? Number(lastSeenRaw) : null;
          const awayMs = lastSeenAt && Number.isFinite(lastSeenAt) ? now - lastSeenAt : 0;
          const awaySeconds = Math.max(0, Math.floor(awayMs / 1000));
          const lastGreetingRaw = window.localStorage.getItem(LAST_GREETING_AT_KEY);
          const lastGreetingAt = lastGreetingRaw ? Number(lastGreetingRaw) : 0;

          // Only greet on meaningful return gaps and avoid repeated greetings
          // from rapid refreshes/reconnects.
          if (
            aiSettings.greetingEnabled &&
            awaySeconds >= Math.max(0, aiSettings.greetingMinAwaySeconds) &&
            now - lastGreetingAt >
              Math.max(10, aiSettings.greetingCooldownSeconds) * 1000
          ) {
            const greetingResponse = await fetch(`${backendBaseUrl}/ui/greeting`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                away_seconds: awaySeconds,
                operator_name: aiSettings.operatorName?.trim() || "Shane",
                style_hint: aiSettings.greetingStyle,
                include_recent_work: aiSettings.greetingIncludeRecentWork,
                max_words: aiSettings.greetingMaxWords,
              }),
            });

            if (!greetingResponse.ok) {
              const failure = await greetingResponse.text();
              throw new Error(
                `Greeting request failed (${greetingResponse.status}): ${failure}`
              );
            }

            const payload = (await greetingResponse.json()) as {
              greeting?: string | null;
              decision?: string;
            };
            if (payload.decision === "silent" || payload.greeting == null) {
              return;
            }
            const greeting = payload.greeting.trim();
            if (!greeting) throw new Error("Greeting response was empty.");

            setThreads((current) =>
              current.map((thread) =>
                thread.id === activeThreadId
                  ? {
                      ...thread,
                      updatedAt: Date.now(),
                      messages: [...thread.messages, createGreetingMessage(greeting)],
                    }
                  : thread
              )
            );
            window.localStorage.setItem(LAST_GREETING_AT_KEY, String(now));
          }
        }
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "UI bootstrap failed."
        );
      }
    }

    void fetchUiBootstrap();
  }, [activeThreadId, aiSettings, backendBaseUrl]);

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
          if (activatePanelById("plan")) {
            appendNotice("Manifestation", "Plan constellation summoned");
          } else {
            appendNotice("Panels", "Plan panel is hidden. Re-enable it in UI settings.");
          }
          break;
        case "/tools":
          if (activatePanelById("tools")) {
            appendNotice("Manifestation", "Tool filament summoned");
          } else {
            appendNotice("Panels", "Tool panel is hidden. Re-enable it in UI settings.");
          }
          break;
        case "/telemetry":
        case "/health":
          if (!activatePanelById("telemetry")) {
            appendNotice("Panels", "Telemetry panel is hidden. Re-enable it in UI settings.");
          }
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
    [activatePanelById, appendNotice, contextUsage, fetchHealth, fetchWorkspace]
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
      if (event === "runtime_event") {
        const envelope = parseRuntimeEvent(data);
        if (!envelope) return;

        const previousSeq = lastSeqByRunRef.current.get(envelope.run_id);
        if (typeof previousSeq === "number" && envelope.seq !== previousSeq + 1) {
          setRuntimeGapCount((count) => count + 1);
          appendNotice(
            "Stream Gap",
            `Run ${envelope.run_id.slice(0, 8)} sequence jump ${previousSeq} -> ${envelope.seq}`
          );
        }
        lastSeqByRunRef.current.set(envelope.run_id, envelope.seq);

        appendRuntimeEvent(envelope);

        if (envelope.type === "stream.heartbeat") {
          setLastHeartbeatAt(Date.now());
          return;
        }

        if (envelope.type === "stream.resume_ack") {
          setResumeAckCount((count) => count + 1);
          appendNotice("Stream Resume", "Resume cursor acknowledged");
          return;
        }

        if (envelope.type === "error") {
          appendNotice("Runtime Error", String(envelope.payload.error ?? "Unknown"));
          return;
        }

        if (envelope.type === "status") {
          const nextStatus = String(envelope.payload.status ?? "");
          if (nextStatus === "planning" || nextStatus === "working" || nextStatus === "done") {
            appendNotice("Runtime", nextStatus);
          }
        }
        return;
      }

      if (event === "heartbeat") {
        setLastHeartbeatAt(Date.now());
        return;
      }

      if (event === "status") {
        const nextStatus = data.status as AgentStatus;
        if (nextStatus) {
          setStatus(nextStatus);
        }
        return;
      }

      if (event === "message") {
        const fragment = String(data.content ?? "");
        const sourceNode = String(data.node ?? "");
        if (!fragment) return;
        // Fail-fast: only render primary model output in chat.
        // Ignore middleware/pre-post agent chatter entirely.
        if (sourceNode !== "model") return;
        updateAssistantMessage(threadId, assistantId, (message) => ({
          ...message,
          content: `${message.content}${fragment}`,
          node: sourceNode,
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
        const toolStatus =
          String(data.status ?? "").toLowerCase() === "error" || Boolean(data.error)
            ? "error"
            : "completed";
        let repeatedFailure = false;
        let failedToolName = "";
        updateAssistantMessage(threadId, assistantId, (message) => ({
          ...message,
          toolCalls: message.toolCalls.map((toolCall) => {
            if (toolCall.id !== toolCallId) return toolCall;

            failedToolName = toolCall.name;
            if (toolStatus === "error") {
              const previousFailures = message.toolCalls.filter(
                (existing) =>
                  existing.id !== toolCallId &&
                  existing.name === toolCall.name &&
                  existing.status === "error"
              ).length;
              repeatedFailure = previousFailures >= 1;
            }

            return {
              ...toolCall,
              result: content,
              status: toolStatus,
              error: toolStatus === "error",
            };
          }),
          decayAt: Date.now() + 300_000,
        }));

        setSubagentEchoes((current) =>
          current.map((echo) =>
            echo.id === toolCallId
              ? { ...echo, status: toolStatus === "error" ? "completed" : "completed" }
              : echo
          )
        );
        if (toolStatus === "error") {
          const errorMessage = `Tool failed: ${failedToolName || toolCallId}\n${content}`;
          setError(errorMessage);
          setStatus("error");
          appendNotice("Tool Failure", failedToolName || toolCallId);
          if (repeatedFailure) {
            appendNotice(
              "Failure",
              `Repeated ${failedToolName || "tool"} failure detected; halting retries`
            );
          }
        }
        return;
      }

      if (event === "todos") {
        const parsed = parseTodos(data.todos);
        updateThread(threadId, (thread) => ({
          ...thread,
          todos: parsed,
          updatedAt: Date.now(),
        }));
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
    [appendNotice, appendRuntimeEvent, updateAssistantMessage, updateThread]
  );

  useEffect(() => {
    setCoverageMissingCount(missingSignalClasses.length);
  }, [missingSignalClasses]);

  const handleSubmit = useCallback(
    async (value: string, fileAttachments?: FileAttachment[]) => {
      const hasContent = value.trim() || (fileAttachments && fileAttachments.length > 0);
      if (!hasContent || isStreaming || !activeThread) return;

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
      appendNotice("Command", "Prompt fed into the Orb");

      try {
        // Convert files to base64 for transmission (synchronous read)
        const attachmentData = await Promise.all(
          (fileAttachments || []).map(async (att) => {
            const arrayBuffer = await att.file.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            return {
              name: att.name,
              type: att.type,
              size: att.size,
              isImage: att.isImage,
              data: base64,
            };
          })
        );

        const response = await fetch(`${backendBaseUrl}/invoke/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: submittedValue,
            thread_id: activeThread.id,
            last_event_id: latestRuntimeCursor?.event_id ?? null,
            last_seq: latestRuntimeCursor?.seq ?? null,
            attachments: attachmentData,
          }),
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
      latestRuntimeCursor,
      updateThread,
    ]
  );

  useEffect(() => {
    if (!isStreaming && aiSettings.autoFocusInput) {
      inputRef.current?.focus();
    }
  }, [aiSettings.autoFocusInput, isStreaming]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: aiSettings.smoothScroll ? "smooth" : "auto",
      block: "end",
    });
  }, [aiSettings.smoothScroll, visibleMessages]);

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

      {/* Floating UI Settings Button */}
      <motion.button
        onClick={() => setShowUiSettings(true)}
        className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/60 backdrop-blur-md transition hover:border-white/30 hover:bg-black/60 hover:text-white"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="UI Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1V5M12 19V23M4.22 4.22L7.05 7.05M16.95 16.95L19.78 19.78M1 12H5M19 12H23M4.22 19.78L7.05 16.95M16.95 7.05L19.78 4.22" strokeLinecap="round"/>
        </svg>
      </motion.button>

      <div className="relative flex h-screen flex-col px-3 pb-3 pt-12 sm:px-4 sm:pb-4 sm:pt-16">
        <div className="absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-[44vh] sm:h-[48vh]">
            <OrbScene
              mode={orbMode}
              contextRatio={contextUsage / 100}
              reducedMotion={reducedMotion}
              orbSpeed={uiSettings.orbSpeed}
              orbDistortion={uiSettings.orbDistortion}
              orbGlow={uiSettings.orbGlow}
              ambientLight={uiSettings.ambientLight}
              orbColors={uiSettings.orbColors}
              showParticles={uiSettings.showParticles}
              showReflections={uiSettings.showReflections}
            />
          </div>
        </div>

        <div className="relative z-10 min-h-0 flex-1">
          <div
            className="relative flex h-full flex-col overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,14,22,0.06)_0%,rgba(8,11,18,0.12)_12%,rgba(5,7,12,0.22)_30%,rgba(2,3,6,0.72)_100%)] shadow-[0_30px_120px_rgba(0,0,0,0.34)] backdrop-blur-[10px]"
            style={{ opacity: uiSettings.panelOpacity }}
          >
            {/* Left dock - inside main panel edge, below header */}
            <div
              className="absolute left-0 top-[3.75rem] z-20 hidden xl:block"
              onMouseEnter={() => setLeftHovered(true)}
              onMouseLeave={() => setLeftHovered(false)}
            >
              <div className="w-[22rem] px-2 pt-2">
                <AnimatePresence mode="wait">
                  {leftActivePanel === "plan" && (!leftMinimized || leftHovered) ? (
                    <PlanConstellation
                      key="plan-edge"
                      todos={todos}
                      visible={true}
                      onClose={() =>
                        setDockActivePanel(
                          "left",
                          leftPanels.find((panelId) => panelId !== "plan") ?? "plan"
                        )
                      }
                    />
                  ) : leftMinimized && !leftHovered ? (
                    <motion.div
                      key="left-min"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "3rem" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="flex flex-col items-center gap-3 py-4"
                    >
                      <div className="h-12 w-1 rounded-full bg-gradient-to-b from-violet-400/40 to-transparent" />
                      <div className="mt-4 flex flex-col gap-2">
                        {leftPanels.map((panelId) => (
                          <button
                            key={panelId}
                            onClick={() => setDockActivePanel("left", panelId)}
                            className={`flex h-8 w-8 items-center justify-center rounded-full border text-[10px] ${
                              leftActivePanel === panelId
                                ? "border-violet-400/40 bg-violet-400/20 text-violet-200"
                                : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
                            }`}
                            title={PANEL_LABEL[panelId]}
                          >
                            {PANEL_ICON[panelId]}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ) : leftActivePanel === "telemetry" ? (
                    <motion.div
                      key="left-telemetry"
                      initial={{ opacity: 0, x: -12, width: 0 }}
                      animate={{ opacity: 1, x: 0, width: "22rem" }}
                      exit={{ opacity: 0, x: -10, width: 0 }}
                      className="w-[22rem]"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/38">
                          Telemetry
                        </div>
                        <button
                          onClick={() => setLeftMinimized(true)}
                          className="rounded-full p-1 text-white/30 hover:bg-white/5 hover:text-white/60"
                        >
                          ←
                        </button>
                      </div>
                      <TelemetryPanel
                        identity={uiMeta?.identity ?? null}
                        health={health}
                        connectionStatus={connectionStatus}
                        contextRatio={contextUsage / 100}
                        isStreaming={isStreaming}
                        runtimeNotices={runtimeNotices}
                        runtimeEventCount={runtimeEvents.length}
                        runtimeGapCount={runtimeGapCount}
                        coverageMissingCount={coverageMissingCount}
                        frameworkTimeline={frameworkTimeline}
                        requiredSignalClasses={requiredSignalClasses}
                        observedSignalClasses={observedSignalClassList}
                        missingSignalClasses={missingSignalClasses}
                        runtimeHeartbeatAgeMs={runtimeHeartbeatAgeMs}
                        resumeAckCount={resumeAckCount}
                      />
                    </motion.div>
                  ) : leftActivePanel === "tools" ? (
                    <motion.div
                      key="left-tools"
                      initial={{ opacity: 0, x: -12, width: 0 }}
                      animate={{ opacity: 1, x: 0, width: "22rem" }}
                      exit={{ opacity: 0, x: -10, width: 0 }}
                      className="w-[22rem]"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/38">
                          Tools
                        </div>
                        <button
                          onClick={() => setLeftMinimized(true)}
                          className="rounded-full p-1 text-white/30 hover:bg-white/5 hover:text-white/60"
                        >
                          ←
                        </button>
                      </div>
                      <ToolFilament tools={toolCalls} />
                    </motion.div>
                  ) : (
                    <motion.aside
                      key="left-idle"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="w-[22rem] p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/38">
                          {PANEL_LABEL[leftActivePanel]}
                        </div>
                        <button
                          onClick={() => setLeftMinimized(true)}
                          className="rounded-full p-1 text-white/30 hover:bg-white/5 hover:text-white/60"
                        >
                          ←
                        </button>
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
            </div>

            {/* Right dock - inside main panel edge, below header */}
            <div
              className="absolute right-0 top-[3.75rem] z-20 hidden xl:block"
              onMouseEnter={() => setRightHovered(true)}
              onMouseLeave={() => setRightHovered(false)}
            >
              <div className="w-[23rem] px-2 pt-2">
                <AnimatePresence mode="wait">
                  {rightMinimized && !rightHovered ? (
                    <motion.div
                      key="right-min"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "3rem" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="flex h-full flex-col items-center gap-3 py-4"
                    >
                      <div className="flex flex-col gap-2">
                        {rightPanels.map((panelId) => (
                          <button
                            key={panelId}
                            onClick={() => setDockActivePanel("right", panelId)}
                            className={`flex h-8 w-8 items-center justify-center rounded-full border text-[10px] ${
                              rightActivePanel === panelId
                                ? "border-cyan-400/40 bg-cyan-400/20 text-cyan-200"
                                : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"
                            }`}
                            title={PANEL_LABEL[panelId]}
                          >
                            {PANEL_ICON[panelId]}
                          </button>
                        ))}
                      </div>
                      <div className="mt-auto h-12 w-1 rounded-full bg-gradient-to-t from-cyan-400/40 to-transparent" />
                    </motion.div>
                  ) : rightActivePanel === "tools" ? (
                    <motion.div
                      key="tools"
                      initial={{ opacity: 0, x: 12, width: 0 }}
                      animate={{ opacity: 1, x: 0, width: "23rem" }}
                      exit={{ opacity: 0, x: 10, width: 0 }}
                      className="w-[23rem]"
                    >
                      <div className="mb-2 flex items-center justify-end">
                        <button
                          onClick={() => setRightMinimized(true)}
                          className="rounded-full p-1 text-white/30 hover:bg-white/5 hover:text-white/60"
                        >
                          →
                        </button>
                      </div>
                      <ToolFilament tools={toolCalls} />
                    </motion.div>
                  ) : rightActivePanel === "plan" ? (
                    <motion.div
                      key="right-plan"
                      initial={{ opacity: 0, x: 12, width: 0 }}
                      animate={{ opacity: 1, x: 0, width: "23rem" }}
                      exit={{ opacity: 0, x: 10, width: 0 }}
                      className="w-[23rem]"
                    >
                      <div className="mb-2 flex items-center justify-end">
                        <button
                          onClick={() => setRightMinimized(true)}
                          className="rounded-full p-1 text-white/30 hover:bg-white/5 hover:text-white/60"
                        >
                          →
                        </button>
                      </div>
                      <PlanConstellation
                        key="plan-right"
                        todos={todos}
                        visible={true}
                        onClose={() =>
                          setDockActivePanel(
                            "right",
                            rightPanels.find((panelId) => panelId !== "plan") ?? "plan"
                          )
                        }
                      />
                    </motion.div>
                  ) : rightActivePanel === "quick_prompts" ? (
                    <motion.aside
                      key="right-prompts"
                      initial={{ opacity: 0, x: 12, width: 0 }}
                      animate={{ opacity: 1, x: 0, width: "23rem" }}
                      exit={{ opacity: 0, x: 10, width: 0 }}
                      className="w-[23rem] p-4"
                    >
                      <div className="mb-3 flex items-center justify-end">
                        <button
                          onClick={() => setRightMinimized(true)}
                          className="rounded-full p-1 text-white/30 hover:bg-white/5 hover:text-white/60"
                        >
                          →
                        </button>
                      </div>
                      <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/38">
                          Quick prompts
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                          {idleSuggestions.slice(0, 3).map((suggestion) => (
                            <button
                              key={`right-${suggestion}`}
                              type="button"
                              onClick={() => setInput(suggestion)}
                              className="rounded-[0.9rem] border border-white/8 bg-white/[0.03] px-3 py-2 text-left text-xs text-white/66 transition hover:border-white/16 hover:bg-white/[0.06] hover:text-white/88"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.aside>
                  ) : (
                    <motion.div
                      key="telemetry"
                      initial={{ opacity: 0, x: 12, width: 0 }}
                      animate={{ opacity: 1, x: 0, width: "23rem" }}
                      exit={{ opacity: 0, x: 10, width: 0 }}
                      className="w-[23rem]"
                    >
                      <div className="mb-2 flex items-center justify-end">
                        <button
                          onClick={() => setRightMinimized(true)}
                          className="rounded-full p-1 text-white/30 hover:bg-white/5 hover:text-white/60"
                        >
                          →
                        </button>
                      </div>
                      <TelemetryPanel
                        identity={uiMeta?.identity ?? null}
                        health={health}
                        connectionStatus={connectionStatus}
                        contextRatio={contextUsage / 100}
                        isStreaming={isStreaming}
                        runtimeNotices={runtimeNotices}
                        runtimeEventCount={runtimeEvents.length}
                        runtimeGapCount={runtimeGapCount}
                        coverageMissingCount={coverageMissingCount}
                        frameworkTimeline={frameworkTimeline}
                        requiredSignalClasses={requiredSignalClasses}
                        observedSignalClasses={observedSignalClassList}
                        missingSignalClasses={missingSignalClasses}
                        runtimeHeartbeatAgeMs={runtimeHeartbeatAgeMs}
                        resumeAckCount={resumeAckCount}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Panel header — full width, above all docks */}
            <div className="relative z-30 flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3">
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

            {/* Main conduit content area */}
            <div className="relative flex min-h-0 flex-1 flex-col xl:pl-[22rem] xl:pr-[23rem]">

              <div className="arc-hidden-scrollbar relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-6 pb-4" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
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
                    className="pointer-events-auto flex h-full min-h-[22rem] flex-col items-center justify-end pb-12 text-center"
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
                    fontSize={uiSettings.chatFontSize}
                    maxVisible={uiSettings.maxVisibleMessages}
                    onPin={(messageId) => {
                      const target = messages.find((message) => message.id === messageId);
                      setPinned(messageId, !target?.pinned);
                    }}
                  />
                )}
                <div ref={scrollAnchorRef} className="h-1" />
              </div>

              {(leftActivePanel === "plan" || rightActivePanel === "plan") && (
                <div className="mt-3 xl:hidden">
                  <PlanConstellation
                    key="plan-mobile"
                    todos={todos}
                    visible={true}
                    onClose={() => {
                      if (leftActivePanel === "plan") {
                        setDockActivePanel(
                          "left",
                          leftPanels.find((panelId) => panelId !== "plan") ?? "plan"
                        );
                      } else if (rightActivePanel === "plan") {
                        setDockActivePanel(
                          "right",
                          rightPanels.find((panelId) => panelId !== "plan") ?? "plan"
                        );
                      }
                    }}
                  />
                </div>
              )}

              {/* Input conduit docked to bottom of main panel */}
              <div className="shrink-0 border-t border-white/8 px-4 py-3">
                <CommandConduit
                  ref={inputRef}
                  input={input}
                  isStreaming={isStreaming}
                  reducedMotion={reducedMotion}
                  audioEnabled={uiSettings.audioEnabled}
                  toggleReducedMotion={() =>
                    setUiSettings((current) => ({
                      ...current,
                      reducedMotion: !current.reducedMotion,
                    }))
                  }
                  toggleAudio={() =>
                    setUiSettings((current) => ({
                      ...current,
                      audioEnabled: !current.audioEnabled,
                    }))
                  }
                  commands={uiMeta?.slash_commands ?? []}
                  setInput={setInput}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  onExecuteCommand={(command) => {
                    void handleSlashCommand(command);
                  }}
                  onSubmit={(event, submitAttachments) => {
                    event.preventDefault();
                    void handleSubmit(input, submitAttachments);
                    setAttachments([]); // Clear after submit
                  }}
                />
              </div>
            </div>
          </div>
        </div>
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

      {/* UI Settings Overlay */}
      <AnimatePresence>
        {showUiSettings && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-md"
            onClick={() => setShowUiSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="h-[85vh] w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(12,16,24,0.95)_0%,rgba(8,11,18,0.98)_100%)] shadow-[0_50px_200px_rgba(0,0,0,0.6)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/20">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-violet-300">
                      <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19.4 15C19.1277 15.6171 19.2583 16.3378 19.7351 16.8146L19.8146 16.8941C20.1383 17.2178 20.2043 17.7208 19.9765 18.1121C19.7486 18.5034 19.2784 18.7117 18.8134 18.6275C18.3484 18.5433 17.9792 18.1847 17.8694 17.723C17.7597 17.2614 17.9311 16.7781 18.3056 16.4941C18.6801 16.2102 19.1913 16.1646 19.6065 16.3757" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4.6 15C4.87229 15.6171 4.74169 16.3378 4.26487 16.8146L4.18537 16.8941C3.86167 17.2178 3.7957 17.7208 4.02353 18.1121C4.25136 18.5034 4.72164 18.7117 5.18664 18.6275C5.65164 18.5433 6.02076 18.1847 6.13059 17.723C6.24042 17.2614 6.06894 16.7781 5.69441 16.4941C5.31989 16.2102 4.80871 16.1646 4.39346 16.3757" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M15 4.6C14.3829 4.87229 13.6622 4.74169 13.1854 4.26487L13.1059 4.18537C12.7822 3.86167 12.2792 3.7957 11.8879 4.02353C11.4966 4.25136 11.2883 4.72164 11.3725 5.18664C11.4567 5.65164 11.8153 6.02076 12.277 6.13059C12.7386 6.24042 13.2219 6.06894 13.5059 5.69441C13.7898 5.31989 13.8354 4.80871 13.6243 4.39346" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M9 4.6C9.6171 4.87229 10.3378 4.74169 10.8146 4.26487L10.8941 4.18537C11.2178 3.86167 11.7208 3.7957 12.1121 4.02353C12.5034 4.25136 12.7117 4.72164 12.6275 5.18664C12.5433 5.65164 12.1847 6.02076 11.723 6.13059C11.2614 6.24042 10.7781 6.06894 10.4941 5.69441C10.2102 5.31989 10.1646 4.80871 10.3757 4.39346" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-white/90">UI Settings</h2>
                    <p className="text-[11px] text-white/40">Customize your Arc experience</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUiSettings(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/80"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Settings Content */}
              <div className="h-full overflow-y-auto px-6 py-4 pb-24">
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setUiSettings(DEFAULT_UI_SETTINGS);
                        setLayoutDraft(sanitizePanelLayout(DEFAULT_UI_SETTINGS.panelLayout));
                      }}
                      className="rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 transition hover:border-white/25 hover:text-white"
                    >
                      Reset UI defaults
                    </button>
                    <button
                      onClick={() => setAiSettings(DEFAULT_AI_SETTINGS)}
                      className="rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 transition hover:border-white/25 hover:text-white"
                    >
                      Reset AI defaults
                    </button>
                  </div>
                  {/* Panels Section */}
                  <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.02] p-4">
                    <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-violet-400">
                        <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                        <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                        <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                        <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      Panels
                    </h3>
                    <div className="space-y-4">
                      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
                        <p className="text-sm text-white/80">Panel inventory</p>
                        <p className="mt-1 text-[11px] text-white/42">
                          Choose which panels are visible and where they dock.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(Object.keys(PANEL_LABEL) as DockPanelId[]).map((panelId) => {
                            const currentSlot =
                              layoutDraft == null
                                ? null
                                : DOCK_SLOT_ORDER.find((slot) =>
                                    layoutDraft.slots[slot].includes(panelId)
                                  ) ?? null;
                            return (
                              <div
                                key={`inventory-${panelId}`}
                                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs text-white/75"
                              >
                                <span>{PANEL_ICON[panelId]}</span>
                                <span>{PANEL_LABEL[panelId]}</span>
                                <span className="text-white/40">
                                  {currentSlot ? `(${SLOT_LABEL[currentSlot]})` : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {layoutDraft && (["left", "right"] as const).map((slot) => (
                          <label key={`slot-${slot}`} className="rounded-xl border border-white/8 bg-black/20 p-3">
                            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
                              Active in {SLOT_LABEL[slot]}
                            </div>
                            <select
                              value={layoutDraft.active[slot]}
                              onChange={(e) =>
                                setLayoutDraft((current) => {
                                  const source = sanitizePanelLayout(current ?? uiSettings.panelLayout);
                                  const candidate = e.target.value as DockPanelId;
                                  if (!source.slots[slot].includes(candidate)) return source;
                                  return {
                                    ...source,
                                    active: {
                                      ...source.active,
                                      [slot]: candidate,
                                    },
                                  };
                                })
                              }
                              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85 outline-none focus:border-white/30"
                            >
                              {layoutDraft.slots[slot].map((panelId) => (
                                <option key={`${slot}-${panelId}`} value={panelId}>
                                  {PANEL_LABEL[panelId]}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>

                      <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm text-white/80">Wireframe layout (drag/drop)</p>
                          <p className="text-[11px] text-white/45">
                            Drag panels into Left, Right, or Hidden. Save applies + refreshes.
                          </p>
                        </div>
                        {layoutDraft && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-2">
                              {(["left", "right"] as const).map((slot, idx) => (
                                <div
                                  key={`wire-${slot}`}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    const panelId = e.dataTransfer.getData("text/panel-id") as DockPanelId;
                                    if (!panelId) return;
                                    moveDraftPanel(panelId, slot);
                                  }}
                                  className="min-h-[8.5rem] rounded-lg border border-dashed border-white/20 bg-white/[0.02] p-2"
                                >
                                  <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
                                    {idx === 0 ? "Left Dock" : "Right Dock"}
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    {layoutDraft.slots[slot].map((panelId) => (
                                      <button
                                        key={`wire-${slot}-${panelId}`}
                                        draggable
                                        onDragStart={(e) => e.dataTransfer.setData("text/panel-id", panelId)}
                                        type="button"
                                        className={`rounded-md border px-2 py-1 text-left text-xs transition ${
                                          layoutDraft.active[slot] === panelId
                                            ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100"
                                            : "border-white/12 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                                        }`}
                                        onClick={() =>
                                          setLayoutDraft((current) => {
                                            const source = sanitizePanelLayout(current ?? uiSettings.panelLayout);
                                            return {
                                              ...source,
                                              active: { ...source.active, [slot]: panelId },
                                            };
                                          })
                                        }
                                      >
                                        <span className="mr-1.5">{PANEL_ICON[panelId]}</span>
                                        {PANEL_LABEL[panelId]}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2">
                                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
                                  Main Chat (fixed)
                                </div>
                                <div className="h-[6.5rem] rounded-md border border-white/8 bg-black/20 p-2 text-xs text-white/55">
                                  Conversation stream + command conduit
                                </div>
                              </div>
                            </div>
                            <div
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                const panelId = e.dataTransfer.getData("text/panel-id") as DockPanelId;
                                if (!panelId) return;
                                moveDraftPanel(panelId, "hidden");
                              }}
                              className="rounded-lg border border-dashed border-white/20 bg-white/[0.02] p-2"
                            >
                              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
                                Hidden Panels
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {layoutDraft.slots.hidden.length === 0 && (
                                  <span className="text-xs text-white/35">No hidden panels.</span>
                                )}
                                {layoutDraft.slots.hidden.map((panelId) => (
                                  <button
                                    key={`wire-hidden-${panelId}`}
                                    draggable
                                    onDragStart={(e) => e.dataTransfer.setData("text/panel-id", panelId)}
                                    type="button"
                                    className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-xs text-white/75"
                                  >
                                    <span className="mr-1.5">{PANEL_ICON[panelId]}</span>
                                    {PANEL_LABEL[panelId]}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setLayoutDraft(sanitizePanelLayout(uiSettings.panelLayout))}
                                className="rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 transition hover:border-white/25 hover:text-white"
                              >
                                Reset draft
                              </button>
                              <button
                                type="button"
                                onClick={savePanelLayoutAndRefresh}
                                className="rounded-lg border border-cyan-300/30 bg-cyan-400/20 px-3 py-1.5 text-[11px] text-cyan-100 transition hover:border-cyan-200/45 hover:bg-cyan-400/30"
                              >
                                Save Layout & Refresh
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white/80">Panel opacity</p>
                          <span className="font-mono text-xs text-white/50">{Math.round(uiSettings.panelOpacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.3"
                          max="1"
                          step="0.05"
                          value={uiSettings.panelOpacity}
                          onChange={(e) => setUiSettings(s => ({ ...s, panelOpacity: Number(e.target.value) }))}
                          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-violet-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Orb Section */}
                  <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.02] p-4">
                    <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-cyan-400">
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 1V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M12 19V23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M4.22 4.22L7.05 7.05" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M16.95 16.95L19.78 19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M1 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M19 12H23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M4.22 19.78L7.05 16.95" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M16.95 7.05L19.78 4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      Orb Visualization
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Dynamic colors</p>
                          <p className="text-[11px] text-white/40">Color changes based on agent state</p>
                        </div>
                        <button
                          onClick={() => setUiSettings(s => ({ ...s, orbColors: !s.orbColors }))}
                          className={`h-6 w-11 rounded-full transition-colors ${uiSettings.orbColors ? 'bg-violet-500' : 'bg-white/20'}`}
                        >
                          <motion.div
                            animate={{ x: uiSettings.orbColors ? 22 : 2 }}
                            className="h-5 w-5 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Show reflections</p>
                          <p className="text-[11px] text-white/40">Floor reflection effect</p>
                        </div>
                        <button
                          onClick={() => setUiSettings(s => ({ ...s, showReflections: !s.showReflections }))}
                          className={`h-6 w-11 rounded-full transition-colors ${uiSettings.showReflections ? 'bg-violet-500' : 'bg-white/20'}`}
                        >
                          <motion.div
                            animate={{ x: uiSettings.showReflections ? 22 : 2 }}
                            className="h-5 w-5 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Atmospheric particles</p>
                          <p className="text-[11px] text-white/40">Floating energy particles</p>
                        </div>
                        <button
                          onClick={() => setUiSettings(s => ({ ...s, showParticles: !s.showParticles }))}
                          className={`h-6 w-11 rounded-full transition-colors ${uiSettings.showParticles ? 'bg-violet-500' : 'bg-white/20'}`}
                        >
                          <motion.div
                            animate={{ x: uiSettings.showParticles ? 22 : 2 }}
                            className="h-5 w-5 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white/80">Animation speed</p>
                          <span className="font-mono text-xs text-white/50">{uiSettings.orbSpeed.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="2"
                          step="0.1"
                          value={uiSettings.orbSpeed}
                          onChange={(e) => setUiSettings(s => ({ ...s, orbSpeed: Number(e.target.value) }))}
                          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-violet-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white/80">Distortion level</p>
                          <span className="font-mono text-xs text-white/50">{Math.round(uiSettings.orbDistortion * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="3"
                          step="0.1"
                          value={uiSettings.orbDistortion}
                          onChange={(e) => setUiSettings(s => ({ ...s, orbDistortion: Number(e.target.value) }))}
                          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-violet-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white/80">Glow intensity</p>
                          <span className="font-mono text-xs text-white/50">{Math.round(uiSettings.orbGlow * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="3"
                          step="0.1"
                          value={uiSettings.orbGlow}
                          onChange={(e) => setUiSettings(s => ({ ...s, orbGlow: Number(e.target.value) }))}
                          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-violet-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white/80">Ambient light</p>
                          <span className="font-mono text-xs text-white/50">{Math.round(uiSettings.ambientLight * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="2"
                          step="0.1"
                          value={uiSettings.ambientLight}
                          onChange={(e) => setUiSettings(s => ({ ...s, ambientLight: Number(e.target.value) }))}
                          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-violet-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Chat Section */}
                  <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.02] p-4">
                    <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
                        <path d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 17 18.73C15.6902 19.5608 14.1558 20.0001 12.6 20H12C10.4292 19.9998 8.88433 19.5418 7.57006 18.6776C6.25579 17.8134 5.2304 16.5825 4.6065 15.131C3.9826 13.6794 3.78516 12.0737 4.03726 10.5065C4.28935 8.93937 4.98055 7.47693 6.02621 6.27809C7.07187 5.07926 8.42765 4.19332 9.93858 3.71801C11.4495 3.24269 13.0531 3.19661 14.5889 3.58458" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Chat
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Font size</p>
                          <p className="text-[11px] text-white/40">Adjust message text size</p>
                        </div>
                        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                          {(["small", "medium", "large"] as const).map((size) => (
                            <button
                              key={size}
                              onClick={() => setUiSettings(s => ({ ...s, chatFontSize: size }))}
                              className={`rounded px-3 py-1 text-xs capitalize transition ${uiSettings.chatFontSize === size ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'}`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Audio feedback</p>
                          <p className="text-[11px] text-white/40">Sound on new messages</p>
                        </div>
                        <button
                          onClick={() => setUiSettings(s => ({ ...s, audioEnabled: !s.audioEnabled }))}
                          className={`h-6 w-11 rounded-full transition-colors ${uiSettings.audioEnabled ? 'bg-violet-500' : 'bg-white/20'}`}
                        >
                          <motion.div
                            animate={{ x: uiSettings.audioEnabled ? 22 : 2 }}
                            className="h-5 w-5 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Reduced motion</p>
                          <p className="text-[11px] text-white/40">Disable animations</p>
                        </div>
                        <button
                          onClick={() => setUiSettings(s => ({ ...s, reducedMotion: !s.reducedMotion }))}
                          className={`h-6 w-11 rounded-full transition-colors ${uiSettings.reducedMotion ? 'bg-violet-500' : 'bg-white/20'}`}
                        >
                          <motion.div
                            animate={{ x: uiSettings.reducedMotion ? 22 : 2 }}
                            className="h-5 w-5 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white/80">Visible messages</p>
                          <span className="font-mono text-xs text-white/50">
                            {uiSettings.maxVisibleMessages}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="2"
                          max="12"
                          step="1"
                          value={uiSettings.maxVisibleMessages}
                          onChange={(e) =>
                            setUiSettings((s) => ({
                              ...s,
                              maxVisibleMessages: Number(e.target.value),
                            }))
                          }
                          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-violet-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* AI Section */}
                  <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.02] p-4">
                    <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-indigo-300">
                        <path d="M12 3L20 7V17L12 21L4 17V7L12 3Z" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 8V12L15 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      AI Settings
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Greeting policy</p>
                          <p className="text-[11px] text-white/40">Contextual return greetings from Arc</p>
                        </div>
                        <button
                          onClick={() =>
                            setAiSettings((s) => ({
                              ...s,
                              greetingEnabled: !s.greetingEnabled,
                            }))
                          }
                          className={`h-6 w-11 rounded-full transition-colors ${aiSettings.greetingEnabled ? "bg-violet-500" : "bg-white/20"}`}
                        >
                          <motion.div
                            animate={{ x: aiSettings.greetingEnabled ? 22 : 2 }}
                            className="h-5 w-5 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      </div>
                      <div>
                        <p className="text-sm text-white/80">Operator name</p>
                        <input
                          type="text"
                          value={aiSettings.operatorName}
                          onChange={(e) =>
                            setAiSettings((s) => ({
                              ...s,
                              operatorName: e.target.value,
                            }))
                          }
                          className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/30"
                          placeholder="Shane"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Greeting style</p>
                          <p className="text-[11px] text-white/40">Tone preference for welcome-back message</p>
                        </div>
                        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                          {(["adaptive", "playful", "professional", "direct"] as const).map((style) => (
                            <button
                              key={style}
                              onClick={() =>
                                setAiSettings((s) => ({
                                  ...s,
                                  greetingStyle: style,
                                }))
                              }
                              className={`rounded px-2 py-1 text-[11px] capitalize transition ${
                                aiSettings.greetingStyle === style
                                  ? "bg-white/20 text-white"
                                  : "text-white/50 hover:text-white/80"
                              }`}
                            >
                              {style}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white/80">Greeting minimum away time</p>
                          <span className="font-mono text-xs text-white/50">
                            {aiSettings.greetingMinAwaySeconds}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="30"
                          max="3600"
                          step="30"
                          value={aiSettings.greetingMinAwaySeconds}
                          onChange={(e) =>
                            setAiSettings((s) => ({
                              ...s,
                              greetingMinAwaySeconds: Number(e.target.value),
                            }))
                          }
                          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-violet-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white/80">Greeting cooldown</p>
                          <span className="font-mono text-xs text-white/50">
                            {aiSettings.greetingCooldownSeconds}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="900"
                          step="10"
                          value={aiSettings.greetingCooldownSeconds}
                          onChange={(e) =>
                            setAiSettings((s) => ({
                              ...s,
                              greetingCooldownSeconds: Number(e.target.value),
                            }))
                          }
                          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-violet-500"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Reference recent completed work</p>
                          <p className="text-[11px] text-white/40">Mention concrete progress in greeting</p>
                        </div>
                        <button
                          onClick={() =>
                            setAiSettings((s) => ({
                              ...s,
                              greetingIncludeRecentWork: !s.greetingIncludeRecentWork,
                            }))
                          }
                          className={`h-6 w-11 rounded-full transition-colors ${aiSettings.greetingIncludeRecentWork ? "bg-violet-500" : "bg-white/20"}`}
                        >
                          <motion.div
                            animate={{ x: aiSettings.greetingIncludeRecentWork ? 22 : 2 }}
                            className="h-5 w-5 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white/80">Greeting max words</p>
                          <span className="font-mono text-xs text-white/50">
                            {aiSettings.greetingMaxWords}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="8"
                          max="40"
                          step="1"
                          value={aiSettings.greetingMaxWords}
                          onChange={(e) =>
                            setAiSettings((s) => ({
                              ...s,
                              greetingMaxWords: Number(e.target.value),
                            }))
                          }
                          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-violet-500"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Auto-focus input after responses</p>
                          <p className="text-[11px] text-white/40">Keep typing flow uninterrupted</p>
                        </div>
                        <button
                          onClick={() =>
                            setAiSettings((s) => ({
                              ...s,
                              autoFocusInput: !s.autoFocusInput,
                            }))
                          }
                          className={`h-6 w-11 rounded-full transition-colors ${aiSettings.autoFocusInput ? "bg-violet-500" : "bg-white/20"}`}
                        >
                          <motion.div
                            animate={{ x: aiSettings.autoFocusInput ? 22 : 2 }}
                            className="h-5 w-5 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/80">Smooth auto-scroll</p>
                          <p className="text-[11px] text-white/40">Animate stream anchor movement</p>
                        </div>
                        <button
                          onClick={() =>
                            setAiSettings((s) => ({
                              ...s,
                              smoothScroll: !s.smoothScroll,
                            }))
                          }
                          className={`h-6 w-11 rounded-full transition-colors ${aiSettings.smoothScroll ? "bg-violet-500" : "bg-white/20"}`}
                        >
                          <motion.div
                            animate={{ x: aiSettings.smoothScroll ? 22 : 2 }}
                            className="h-5 w-5 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

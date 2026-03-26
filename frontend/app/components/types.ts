export type AgentStatus = "idle" | "planning" | "working" | "done" | "error";
export type OrbMode = "idle" | "thinking" | "answering" | "paused" | "error";

export type ToolStatus = "pending" | "running" | "completed" | "error";

export type PanelKind = "telemetry" | "plan" | "tools" | null;

export type OverlayKind =
  | "files"
  | "skills"
  | "memories"
  | "config"
  | "threads"
  | null;

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: ToolStatus;
  node?: string;
  createdAt: number;
}

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface ArcMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[];
  createdAt: number;
  decayAt: number;
  pinned: boolean;
  importance: number;
  node?: string;
}

export interface ThreadRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ArcMessage[];
  todos: TodoItem[];
}

export interface SubagentEcho {
  id: string;
  name: string;
  detail: string;
  status: "queued" | "running" | "completed";
  createdAt: number;
}

export interface UiIdentity {
  name: string;
  subtitle: string;
  model: string;
}

export interface UiSubagent {
  id: string;
  name: string;
  description: string;
  model: string;
  status: string;
}

export interface UiSkill {
  id: string;
  name: string;
  summary: string;
  status: "active" | "available";
}

export interface UiMemoryTier {
  id: string;
  name: string;
  path: string;
  description: string;
  status: string;
}

export interface UiSlashCommand {
  id: string;
  label: string;
  description: string;
}

export interface UiSettingItem {
  label: string;
  value: string;
}

export interface UiSettingSection {
  section: string;
  items: UiSettingItem[];
}

export interface UiMeta {
  identity: UiIdentity;
  topbar: {
    context_window: number;
    apcms_status: string;
  };
  subagents: UiSubagent[];
  skills: {
    loaded: UiSkill[];
    recommended: UiSkill[];
  };
  memory_tiers: UiMemoryTier[];
  slash_commands: UiSlashCommand[];
  settings: UiSettingSection[];
}

export interface RuntimeNotice {
  id: string;
  label: string;
  value: string;
}

export interface HealthSnapshot {
  cpu_percent: number;
  cpu_count: number;
  load_avg_1m_5m_15m: number[];
  memory: {
    total_gb: number;
    used_gb: number;
    available_gb: number;
    percent: number;
  };
  disk: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    percent_used: number;
  };
  network: {
    bytes_sent_mb: number;
    bytes_recv_mb: number;
  };
  uptime_since: string;
  timestamp: string;
}

export interface HealthPayload {
  status: "healthy" | "warning" | "critical";
  snapshot: HealthSnapshot;
}

export interface WorkspaceNode {
  name: string;
  path: string;
  type: "directory" | "file" | "meta";
  owner: string;
  size?: number;
  modified_at?: number;
  children?: WorkspaceNode[];
}

export interface WorkspacePayload {
  root: WorkspaceNode;
}

export interface FilePreview {
  path: string;
  content: string;
  truncated: boolean;
  size: number;
  extension: string;
  modified_at: number;
}

export interface OverlayProps {
  meta: UiMeta | null;
  threads: ThreadRecord[];
  activeThreadId: string;
  workspace: WorkspacePayload | null;
  selectedFile: FilePreview | null;
  selectedFilePath: string | null;
  onSelectThread: (threadId: string) => void;
  onOpenFile: (path: string) => void;
}

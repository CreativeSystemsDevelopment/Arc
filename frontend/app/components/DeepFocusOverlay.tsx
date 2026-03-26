"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  FilePreview,
  OverlayKind,
  ThreadRecord,
  UiMemoryTier,
  UiSettingSection,
  UiSkill,
  WorkspaceNode,
} from "./types";

interface DeepFocusOverlayProps {
  overlay: OverlayKind;
  onClose: () => void;
  workspaceRoot: WorkspaceNode | null;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  filePreview: FilePreview | null;
  threads: ThreadRecord[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  skills: { loaded: UiSkill[]; recommended: UiSkill[] } | null;
  memories: UiMemoryTier[] | null;
  settings: UiSettingSection[] | null;
}

function formatRelativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function overlayTitle(kind: OverlayKind) {
  switch (kind) {
    case "files":
      return "Workspace overlay";
    case "skills":
      return "Skills overlay";
    case "memories":
      return "Memory overlay";
    case "config":
      return "Configuration overlay";
    case "threads":
      return "Thread overlay";
    default:
      return "";
  }
}

function TreeNode({
  node,
  selectedPath,
  onSelectPath,
  depth = 0,
}: {
  node: WorkspaceNode;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  depth?: number;
}) {
  const isMeta = node.type === "meta";
  const isDirectory = node.type === "directory";
  const isSelected = selectedPath === node.path;

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={isMeta}
        onClick={() => {
          if (!isDirectory && !isMeta) onSelectPath(node.path);
        }}
        className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition ${
          isSelected
            ? "bg-white/12 text-white"
            : "text-white/75 hover:bg-white/8 hover:text-white"
        } ${isMeta ? "cursor-default opacity-60" : ""}`}
        style={{ paddingLeft: `${0.75 + depth * 0.85}rem` }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-white/45">
            {isMeta ? "…" : isDirectory ? "◈" : "▣"}
          </span>
          <span className="truncate text-sm">{node.name}</span>
        </span>
        {!isDirectory && !isMeta ? (
          <span className="ml-3 text-[11px] uppercase tracking-[0.25em] text-white/35">
            {formatBytes(node.size)}
          </span>
        ) : null}
      </button>
      {isDirectory && node.children?.length ? (
        <div className="space-y-1">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilesView({
  workspaceRoot,
  selectedPath,
  onSelectPath,
  filePreview,
}: {
  workspaceRoot: WorkspaceNode | null;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  filePreview: FilePreview | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
      <section className="rounded-[2rem] border border-white/12 bg-white/6 p-4 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-white/40">
              File system
            </p>
            <h3 className="mt-1 text-lg text-white">Visible workspace tree</h3>
          </div>
          <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-white/50">
            Disk
          </span>
        </div>
        <div className="max-h-[56vh] overflow-auto pr-2">
          {workspaceRoot ? (
            <TreeNode
              node={workspaceRoot}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
            />
          ) : (
            <p className="text-sm text-white/45">Workspace still coalescing.</p>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/12 bg-white/6 p-4 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-white/40">
              Context focus
            </p>
            <h3 className="mt-1 text-lg text-white">File preview</h3>
          </div>
          {filePreview ? (
            <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-white/50">
              {filePreview.extension || "text"}
            </span>
          ) : null}
        </div>
        {filePreview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
              <span>{filePreview.path}</span>
              <span>•</span>
              <span>{formatBytes(filePreview.size)}</span>
              {filePreview.truncated ? (
                <>
                  <span>•</span>
                  <span className="text-amber-200/80">Truncated preview</span>
                </>
              ) : null}
            </div>
            <pre className="max-h-[56vh] overflow-auto rounded-[1.5rem] border border-white/8 bg-black/35 p-4 font-mono text-[12px] leading-6 text-white/80">
              {filePreview.content}
            </pre>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-10 text-center text-sm text-white/40">
            Select a file to crystallize it into view.
          </div>
        )}
      </section>
    </div>
  );
}

function SkillsView({ skills }: { skills: { loaded: UiSkill[]; recommended: UiSkill[] } | null }) {
  if (!skills) {
    return <p className="text-sm text-white/45">Skills still materializing.</p>;
  }

  const groups = [
    { title: "Loaded", items: skills.loaded },
    { title: "Available", items: skills.recommended },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {groups.map((group) => (
        <section
          key={group.title}
          className="rounded-[2rem] border border-white/12 bg-white/6 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg text-white">{group.title}</h3>
            <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-white/45">
              {group.items.length}
            </span>
          </div>
          <div className="space-y-3">
            {group.items.map((skill) => (
              <article
                key={skill.id}
                className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-medium tracking-[0.08em] text-white">
                    {skill.name}
                  </h4>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                      skill.status === "active"
                        ? "bg-emerald-400/12 text-emerald-200"
                        : "bg-white/8 text-white/50"
                    }`}
                  >
                    {skill.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/60">{skill.summary}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MemoriesView({ memories }: { memories: UiMemoryTier[] | null }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {(memories ?? []).map((memory) => (
        <article
          key={memory.id}
          className="rounded-[2rem] border border-white/12 bg-white/6 p-5 backdrop-blur-xl"
        >
          <p className="text-[11px] uppercase tracking-[0.35em] text-white/35">
            {memory.path}
          </p>
          <h3 className="mt-3 text-lg text-white">{memory.name}</h3>
          <p className="mt-3 text-sm leading-6 text-white/60">{memory.description}</p>
          <span className="mt-5 inline-flex rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/45">
            {memory.status}
          </span>
        </article>
      ))}
    </div>
  );
}

function ConfigView({ settings }: { settings: UiSettingSection[] | null }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {(settings ?? []).map((section) => (
        <section
          key={section.section}
          className="rounded-[2rem] border border-white/12 bg-white/6 p-5 backdrop-blur-xl"
        >
          <h3 className="text-lg text-white">{section.section}</h3>
          <div className="mt-5 space-y-3">
            {section.items.map((item) => (
              <div
                key={item.label}
                className="flex items-start justify-between gap-4 rounded-[1.25rem] border border-white/8 bg-black/25 px-4 py-3"
              >
                <span className="text-sm text-white/70">{item.label}</span>
                <span className="text-right font-mono text-xs text-white/45">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ThreadsView({
  threads,
  activeThreadId,
  onSelectThread,
}: {
  threads: ThreadRecord[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {threads.map((thread) => {
        const selected = activeThreadId === thread.id;
        return (
          <button
            key={thread.id}
            type="button"
            onClick={() => onSelectThread(thread.id)}
            className={`rounded-[2rem] border p-5 text-left backdrop-blur-xl transition ${
              selected
                ? "border-white/24 bg-white/10"
                : "border-white/12 bg-white/6 hover:bg-white/8"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-white/35">
                  {thread.id.slice(0, 12)}
                </p>
                <h3 className="mt-3 text-lg text-white">{thread.title}</h3>
              </div>
              {selected ? (
                <span className="rounded-full bg-emerald-400/14 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-emerald-200">
                  Active
                </span>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-white/45">
              <span>{thread.messages.length} messages</span>
              <span>•</span>
              <span>{thread.todos.length} todos</span>
              <span>•</span>
              <span>{formatRelativeTime(thread.updatedAt)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function DeepFocusOverlay(props: DeepFocusOverlayProps) {
  const {
    overlay,
    onClose,
    workspaceRoot,
    selectedPath,
    onSelectPath,
    filePreview,
    threads,
    activeThreadId,
    onSelectThread,
    skills,
    memories,
    settings,
  } = props;

  return (
    <AnimatePresence>
      {overlay ? (
        <motion.div
          key={overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 px-4 py-4 backdrop-blur-md sm:items-center sm:px-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 36, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.2, 1, 0.3, 1] }}
            className="relative flex max-h-[88vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2.6rem] border border-white/12 bg-[#05060b]/88 shadow-[0_40px_160px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.4em] text-white/35">
                  Deep focus
                </p>
                <h2 className="mt-2 text-2xl font-medium text-white">
                  {overlayTitle(overlay)}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/12 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-white/55 transition hover:bg-white/8 hover:text-white"
              >
                Dismiss
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
              {overlay === "files" ? (
                <FilesView
                  workspaceRoot={workspaceRoot}
                  selectedPath={selectedPath}
                  onSelectPath={onSelectPath}
                  filePreview={filePreview}
                />
              ) : null}
              {overlay === "skills" ? <SkillsView skills={skills} /> : null}
              {overlay === "memories" ? <MemoriesView memories={memories} /> : null}
              {overlay === "config" ? <ConfigView settings={settings} /> : null}
              {overlay === "threads" ? (
                <ThreadsView
                  threads={threads}
                  activeThreadId={activeThreadId}
                  onSelectThread={onSelectThread}
                />
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

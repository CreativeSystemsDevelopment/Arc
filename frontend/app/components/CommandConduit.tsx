"use client";

import { AnimatePresence, motion } from "framer-motion";
import { forwardRef, useState, useCallback } from "react";

import type { UiSlashCommand, FileAttachment } from "./types";

interface CommandConduitProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (event: React.FormEvent, attachments?: FileAttachment[]) => void;
  onExecuteCommand?: (command: string) => void;
  isStreaming: boolean;
  reducedMotion: boolean;
  audioEnabled: boolean;
  toggleReducedMotion: () => void;
  toggleAudio: () => void;
  commands: UiSlashCommand[];
  attachments?: FileAttachment[];
  onAttachmentsChange?: (attachments: FileAttachment[]) => void;
}

export const CommandConduit = forwardRef<HTMLTextAreaElement, CommandConduitProps>(
  function CommandConduit(
    {
      input,
      setInput,
      onSubmit,
      onExecuteCommand,
      isStreaming,
      reducedMotion,
      audioEnabled,
      toggleReducedMotion,
      toggleAudio,
      commands,
      attachments = [],
      onAttachmentsChange,
    },
    ref
  ) {
    const [isDragging, setIsDragging] = useState(false);
    const showPalette = input.startsWith("/");
    const filteredCommands = showPalette
      ? commands.filter((command) =>
          command.label.toLowerCase().includes(input.toLowerCase().trim())
        )
      : [];

    const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items;
      if (!items || !onAttachmentsChange) return;

      const newAttachments: FileAttachment[] = [];
      
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            const attachment: FileAttachment = {
              id: crypto.randomUUID(),
              file,
              name: file.name,
              type: file.type,
              size: file.size,
              isImage: file.type.startsWith("image/"),
              previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
            };
            newAttachments.push(attachment);
          }
        }
      }

      if (newAttachments.length > 0) {
        event.preventDefault();
        onAttachmentsChange([...attachments, ...newAttachments]);
      }
    }, [attachments, onAttachmentsChange]);

    const handleDrop = useCallback((event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      
      if (!onAttachmentsChange) return;

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const newAttachments: FileAttachment[] = [];
      
      for (const file of Array.from(files)) {
        const attachment: FileAttachment = {
          id: crypto.randomUUID(),
          file,
          name: file.name,
          type: file.type,
          size: file.size,
          isImage: file.type.startsWith("image/"),
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        };
        newAttachments.push(attachment);
      }

      onAttachmentsChange([...attachments, ...newAttachments]);
    }, [attachments, onAttachmentsChange]);

    const handleDragOver = useCallback((event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
    }, []);

    const removeAttachment = useCallback((id: string) => {
      if (!onAttachmentsChange) return;
      const attachment = attachments.find(a => a.id === id);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      onAttachmentsChange(attachments.filter(a => a.id !== id));
    }, [attachments, onAttachmentsChange]);

    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    const handleSubmitWithAttachments = (event: React.FormEvent) => {
      onSubmit(event, attachments);
      // Clear attachments after submit
      if (onAttachmentsChange) {
        attachments.forEach(a => {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        });
        onAttachmentsChange([]);
      }
    };

    return (
      <div className="pointer-events-auto w-full">
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center justify-between px-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
            <span>Input conduit</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleReducedMotion}
                className="rounded-full border border-white/10 px-2 py-1 text-[10px] tracking-[0.2em] text-white/60 transition hover:border-white/20 hover:text-white"
              >
                motion {reducedMotion ? "off" : "on"}
              </button>
              <button
                type="button"
                onClick={toggleAudio}
                className="rounded-full border border-white/10 px-2 py-1 text-[10px] tracking-[0.2em] text-white/60 transition hover:border-white/20 hover:text-white"
              >
                audio {audioEnabled ? "on" : "off"}
              </button>
            </div>
          </div>

          <form
            onSubmit={handleSubmitWithAttachments}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative overflow-hidden rounded-[1.8rem] border px-5 py-4 shadow-[0_-12px_50px_rgba(0,0,0,0.18)] backdrop-blur-2xl transition-colors ${
              isDragging 
                ? "border-violet-400/60 bg-violet-500/10" 
                : "border-white/12 bg-[linear-gradient(180deg,rgba(10,14,22,0.46),rgba(7,10,17,0.58))]"
            }`}
          >
            {isDragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-medium text-violet-200">Drop files here</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-white/28 to-transparent" />
            <div
              className="pointer-events-none absolute inset-x-[18%] -bottom-10 h-14 rounded-full bg-[radial-gradient(circle,rgba(132,150,255,0.14),transparent_70%)] blur-2xl"
              style={{ opacity: reducedMotion ? 0.34 : 0.24 }}
            />

            <label htmlFor="arc-command-conduit" className="sr-only">
              Message Arc
            </label>
            <div className="flex items-end gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/66">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <path d="M12 4v16" />
                  <path d="M6.5 10.5 12 4l5.5 6.5" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <textarea
                  ref={ref}
                  id="arc-command-conduit"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  disabled={isStreaming}
                  rows={1}
                  placeholder="Message Arc..."
                  className="max-h-40 min-h-[52px] w-full resize-none bg-transparent text-[15px] leading-7 text-white placeholder:text-white/34 focus:outline-none disabled:opacity-60"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/36">
                  <span>Enter to send</span>
                  <span className="text-white/18">/</span>
                  <span>Use slash commands for plan, files, health, and threads</span>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={isStreaming || (!input.trim() && attachments.length === 0)}
                whileHover={reducedMotion ? undefined : { scale: 1.02 }}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/[0.06] px-6 text-[11px] uppercase tracking-[0.28em] text-white transition hover:border-white/24 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isStreaming ? "Working" : attachments.length > 0 ? `Send ${attachments.length}` : "Send"}
              </motion.button>
            </div>

            {/* Attachments preview */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: reducedMotion ? 0.1 : 0.2 }}
                  className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3"
                >
                  {attachments.map((attachment) => (
                    <motion.div
                      key={attachment.id}
                      layout
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="group relative flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] p-2 pr-8"
                    >
                      {attachment.isImage && attachment.previewUrl ? (
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05]">
                          <svg
                            className="h-5 w-5 text-white/60"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                            />
                          </svg>
                        </div>
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span className="max-w-[120px] truncate text-xs text-white/80">
                          {attachment.name}
                        </span>
                        <span className="text-[10px] text-white/40">
                          {formatFileSize(attachment.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          <AnimatePresence>
            {showPalette && filteredCommands.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 18, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 12, filter: "blur(10px)" }}
                transition={{ duration: reducedMotion ? 0.15 : 0.3 }}
                className="mx-auto grid w-full max-w-4xl gap-2 rounded-[1.6rem] border border-white/10 bg-slate-950/88 p-3 shadow-[0_-18px_52px_rgba(0,0,0,0.22)] backdrop-blur-xl"
              >
                {filteredCommands.slice(0, 6).map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    onClick={() => {
                      if (onExecuteCommand) {
                        onExecuteCommand(command.label);
                        setInput("");
                        return;
                      }
                      setInput(`${command.label} `);
                    }}
                    className="flex items-start justify-between rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/14 hover:bg-white/[0.05]"
                  >
                    <div>
                      <p className="font-mono text-xs text-white/84">{command.label}</p>
                      <p className="mt-1 text-xs text-white/55">{command.description}</p>
                    </div>
                    <span className="mt-0.5 text-[10px] uppercase tracking-[0.28em] text-white/30">
                      run
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }
);

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { forwardRef } from "react";

import type { UiSlashCommand } from "./types";

interface CommandConduitProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onExecuteCommand?: (command: string) => void;
  isStreaming: boolean;
  reducedMotion: boolean;
  audioEnabled: boolean;
  toggleReducedMotion: () => void;
  toggleAudio: () => void;
  commands: UiSlashCommand[];
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
    },
    ref
  ) {
    const showPalette = input.startsWith("/");
    const filteredCommands = showPalette
      ? commands.filter((command) =>
          command.label.toLowerCase().includes(input.toLowerCase().trim())
        )
      : [];

    return (
      <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={
            reducedMotion
              ? { opacity: 1, y: 0 }
              : {
                  opacity: 1,
                  y: [0, -4, 0],
                }
          }
          transition={
            reducedMotion
              ? { duration: 0.2, ease: "easeOut" }
              : {
                  duration: 9,
                  repeat: Infinity,
                  repeatType: "mirror",
                  ease: "easeInOut",
                }
          }
          className="mx-auto flex max-w-4xl flex-col gap-3"
        >
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

          <motion.form
            onSubmit={onSubmit}
            initial={{ opacity: 0.8, scale: 0.99 }}
            animate={
              reducedMotion
                ? { opacity: 1, scale: 1 }
                : {
                    opacity: 1,
                    scale: [1, 1.006, 1],
                  }
            }
            transition={
              reducedMotion
                ? { duration: 0.15 }
                : {
                    duration: 6.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
            }
            className="relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,14,22,0.92),rgba(7,10,17,0.96))] px-5 py-4 shadow-[0_-12px_50px_rgba(0,0,0,0.22)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-white/28 to-transparent" />
            <motion.div
              className="pointer-events-none absolute inset-x-[18%] -bottom-10 h-14 rounded-full bg-[radial-gradient(circle,rgba(132,150,255,0.14),transparent_70%)] blur-2xl"
              animate={
                reducedMotion
                  ? { opacity: 0.4 }
                  : {
                      opacity: [0.16, 0.28, 0.16],
                      scaleX: [0.94, 1.04, 0.94],
                    }
              }
              transition={{
                duration: reducedMotion ? 0.2 : 5.8,
                repeat: reducedMotion ? 0 : Infinity,
                ease: "easeInOut",
              }}
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
                disabled={isStreaming || !input.trim()}
                whileHover={reducedMotion ? undefined : { scale: 1.02 }}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/[0.06] px-6 text-[11px] uppercase tracking-[0.28em] text-white transition hover:border-white/24 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isStreaming ? "Working" : "Send"}
              </motion.button>
            </div>
          </motion.form>

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
        </motion.div>
      </div>
    );
  }
);

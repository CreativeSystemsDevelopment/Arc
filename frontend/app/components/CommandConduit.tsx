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
          className="mx-auto flex max-w-5xl flex-col gap-3"
        >
          <div className="flex items-center justify-between px-2 text-[10px] uppercase tracking-[0.38em] text-white/45">
            <span>Operator anchor</span>
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
            className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(9,12,22,0.82),rgba(6,8,15,0.94))] px-5 py-4 shadow-[0_-18px_70px_rgba(54,27,108,0.18)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent" />
            <div className="pointer-events-none absolute left-1/2 top-0 h-16 w-px -translate-x-1/2 bg-gradient-to-b from-violet-300/60 to-transparent" />
            <motion.div
              className="pointer-events-none absolute inset-x-[14%] -bottom-10 h-16 rounded-full bg-[radial-gradient(circle,rgba(149,128,255,0.28),transparent_68%)] blur-2xl"
              animate={
                reducedMotion
                  ? { opacity: 0.4 }
                  : {
                      opacity: [0.18, 0.42, 0.18],
                      scaleX: [0.9, 1.08, 0.9],
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
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/70">
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
                  placeholder="Message Arc through the conduit..."
                  className="max-h-40 min-h-[52px] w-full resize-none bg-transparent text-[15px] leading-7 text-white placeholder:text-white/35 focus:outline-none disabled:opacity-60"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/38">
                  <span>Enter to transmit</span>
                  <span className="text-white/18">/</span>
                  <span>Slash commands reveal summoned structures</span>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={isStreaming || !input.trim()}
                whileHover={reducedMotion ? undefined : { scale: 1.02 }}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-violet-300/30 bg-white/10 px-6 text-[11px] uppercase tracking-[0.34em] text-white transition hover:border-violet-300/50 hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isStreaming ? "Receiving" : "Transmit"}
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
                className="mx-auto grid w-full max-w-4xl gap-2 rounded-[1.75rem] border border-white/10 bg-slate-950/82 p-3 shadow-[0_-20px_60px_rgba(80,62,180,0.18)] backdrop-blur-xl"
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
                    className="flex items-start justify-between rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3 text-left transition hover:border-violet-300/20 hover:bg-white/[0.05]"
                  >
                    <div>
                      <p className="font-mono text-xs text-violet-100">{command.label}</p>
                      <p className="mt-1 text-xs text-white/55">{command.description}</p>
                    </div>
                    <span className="mt-0.5 text-[10px] uppercase tracking-[0.28em] text-white/30">
                      summon
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

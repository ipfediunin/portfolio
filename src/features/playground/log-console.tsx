"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

import { usePlayground, type PlaygroundCopy } from "./use-playground";

const levelColor = {
  info: "text-flow-sync",
  warn: "text-status-retry",
  error: "text-status-failed",
} as const;

export function LogConsole({ copy }: { readonly copy: PlaygroundCopy }) {
  const logs = usePlayground((state) => state.logs);
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the newest line in view, like a terminal.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [logs]);

  return (
    <section
      aria-label={copy.logs}
      className="rounded-2xl border border-line bg-ink p-4 sm:p-5"
    >
      <h3 className="font-mono text-xs tracking-[0.14em] text-white/50 uppercase">
        {copy.logs}
      </h3>
      <ol
        ref={listRef}
        role="log"
        aria-live="polite"
        className="mt-3 max-h-64 space-y-1 overflow-y-auto font-mono text-[12px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <li className="text-white/40">{copy.logsEmpty}</li>
        ) : null}
        {logs.map((entry, index) => (
          <li
            key={`${entry.runId}-${index}-${entry.at}`}
            className="grid grid-cols-[4.5rem_6.5rem_1fr] gap-2 text-white/85"
          >
            <span className="text-white/40">
              {(entry.at / 1000).toFixed(2)}s
            </span>
            <span className={cn("truncate", levelColor[entry.level])}>
              {entry.nodeId}
            </span>
            <span className="break-words">
              {entry.message}
              <span className="text-white/30">
                {" "}
                trace={entry.traceId.slice(0, 6)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

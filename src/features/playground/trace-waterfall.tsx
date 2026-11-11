"use client";

import { useEffect, useRef } from "react";

import { useNodeActions } from "@/features/stage/stage-provider";
import { cityGraph } from "@/simulation/graphs/city";
import { cn } from "@/lib/cn";

import {
  usePlayground,
  usePlaygroundController,
  type PlaygroundCopy,
} from "./use-playground";

const nodeLabels = new Map(
  cityGraph.nodes.map((node) => [node.id, node.label]),
);
const ROW_GRID = "grid grid-cols-[minmax(0,9rem)_1fr_4rem] gap-3";

/**
 * Distributed-tracing style waterfall of the active run, with a playhead that follows the player.
 * Pointing at a span points its node out on the scene.
 */
export function TraceWaterfall({ copy }: { readonly copy: PlaygroundCopy }) {
  const controller = usePlaygroundController();
  const spans = usePlayground((state) => state.spans);
  const start = usePlayground((state) => state.activeRunStart);
  const end = usePlayground((state) => state.activeRunEnd);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const total = Math.max(1, end - start);
  const { preview } = useNodeActions();

  useEffect(() => () => preview([]), [preview]);

  // The playhead moves every frame: written straight to the DOM instead of through React state.
  useEffect(
    () =>
      controller.onFrame((time) => {
        const playhead = playheadRef.current;
        if (!playhead) return;
        const progress = Math.min(1, Math.max(0, (time - start) / total));
        playhead.style.transform = `translateX(${progress * 100}cqw)`;
      }),
    [controller, start, total],
  );

  return (
    <section
      aria-label={copy.trace}
      className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      <h3 className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
        {copy.trace}
      </h3>
      {spans.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">{copy.traceEmpty}</p>
      ) : (
        <div className="relative mt-4">
          <ol className="space-y-1.5" onPointerLeave={() => preview([])}>
            {spans.map((span) => (
              <li
                key={span.id}
                onPointerEnter={() => preview([span.nodeId])}
                className={cn(
                  ROW_GRID,
                  "-mx-1.5 items-center rounded-lg px-1.5 py-0.5 text-xs transition-colors hover:bg-bg",
                )}
              >
                <span className="truncate">
                  <span className="block font-semibold text-ink">
                    {nodeLabels.get(span.nodeId) ?? span.nodeId}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-ink-3">
                    {span.name}
                  </span>
                </span>
                <span className="relative h-2.5 rounded-full bg-bg">
                  <span
                    className={cn(
                      "absolute inset-y-0 rounded-full",
                      span.ok
                        ? "bg-linear-to-r from-flow-sync to-brand"
                        : "bg-status-failed",
                    )}
                    style={{
                      left: `${((span.startAt - start) / total) * 100}%`,
                      width: `${Math.max(1.5, ((span.endAt - span.startAt) / total) * 100)}%`,
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "text-right font-mono",
                    span.ok ? "text-ink-2" : "text-status-failed",
                  )}
                >
                  {span.reportedMs} ms
                </span>
              </li>
            ))}
          </ol>
          {/* Same columns as the rows, so the playhead spans exactly the bar column. */}
          <div
            aria-hidden="true"
            className={cn(ROW_GRID, "pointer-events-none absolute inset-0")}
          >
            <span />
            <span className="@container relative">
              <span
                ref={playheadRef}
                className="absolute -inset-y-1 left-0 w-0.5 rounded-full bg-ink/70"
              />
            </span>
            <span />
          </div>
        </div>
      )}
    </section>
  );
}

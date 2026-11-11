"use client";

import { useEffect } from "react";

import {
  useNodeActions,
  useStageSelection,
} from "@/features/stage/stage-provider";
import { cn } from "@/lib/cn";

import type { InspectorNode } from "./inspector-data";

/**
 * The scene's nodes as plain buttons: the keyboard and screen-reader way into the city. Hover or
 * focus points the node out on the scene; activating it opens the inspector.
 */
export function NodeList({
  nodes,
}: {
  readonly nodes: readonly InspectorNode[];
}) {
  const selectedNodeId = useStageSelection((state) => state.selectedNodeId);
  const { select, preview } = useNodeActions();

  // A preview must not outlive the list (e.g. navigating away while hovering an item).
  useEffect(() => () => preview([]), [preview]);

  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {nodes.map((node) => {
        const selected = node.id === selectedNodeId;
        return (
          <li key={node.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => select(selected ? null : node.id)}
              onPointerEnter={() => preview([node.id])}
              onPointerLeave={() => preview([])}
              onFocus={() => preview([node.id])}
              onBlur={() => preview([])}
              className={cn(
                "flex min-h-14 w-full flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-200",
                selected
                  ? "border-brand/40 bg-brand/5"
                  : "border-line bg-surface hover:border-ink-3/40",
              )}
            >
              <span className="text-sm font-bold text-ink">{node.label}</span>
              <span className="mt-0.5 font-mono text-[11px] text-ink-3">
                {node.kind} · {node.tech}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

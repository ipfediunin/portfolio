"use client";

import Link from "next/link";
import { useEffect } from "react";

import {
  useNodeActions,
  useStageSelection,
} from "@/features/stage/stage-provider";
import { cn } from "@/lib/cn";

import type { StackTechnology } from "./stack-scene-data";

/**
 * The area's technologies, linked to the scene both ways: pointing at a technology lights up the
 * buildings it runs in, pointing at a building lights up its technologies. Activating one opens the
 * inspector of its first building. Under each technology, links lead to the case studies that used
 * it, or to the section of the site that shows it when nothing else does.
 */
export function TechnologyList({
  technologies,
  casesLabel,
}: {
  readonly technologies: readonly StackTechnology[];
  readonly casesLabel: string;
}) {
  const hoveredNodeId = useStageSelection((state) => state.hoveredNodeId);
  const selectedNodeId = useStageSelection((state) => state.selectedNodeId);
  const { select, preview } = useNodeActions();

  // A preview must not outlive the list (e.g. switching to another area while hovering).
  useEffect(() => () => preview([]), [preview]);

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {technologies.map((technology) => {
        const lit =
          (hoveredNodeId !== null &&
            technology.nodeIds.includes(hoveredNodeId)) ||
          (selectedNodeId !== null &&
            technology.nodeIds.includes(selectedNodeId));
        const onScene = technology.nodeIds.length > 0;
        const description = (
          <>
            <span className="text-base font-bold tracking-[-0.01em] text-ink">
              {technology.name}
            </span>
            <span className="mt-1 text-sm leading-relaxed text-ink-2">
              {technology.summary}
            </span>
            {technology.nodeLabels.length > 0 ? (
              <span className="mt-3 font-mono text-[11px] text-ink-3">
                {technology.nodeLabels.join(" · ")}
              </span>
            ) : null}
          </>
        );
        return (
          <li
            key={technology.id}
            className={cn(
              "flex h-full flex-col rounded-2xl border transition-colors duration-200",
              lit
                ? "border-brand/40 bg-brand/5"
                : "border-line bg-surface hover:border-ink-3/40",
            )}
          >
            {onScene ? (
              <button
                type="button"
                onClick={() => select(technology.nodeIds[0] ?? null)}
                onPointerEnter={() => preview(technology.nodeIds)}
                onPointerLeave={() => preview([])}
                onFocus={() => preview(technology.nodeIds)}
                onBlur={() => preview([])}
                className="flex flex-1 flex-col items-start rounded-2xl p-4 text-left"
              >
                {description}
              </button>
            ) : (
              <div className="flex flex-1 flex-col items-start p-4">
                {description}
              </div>
            )}
            {technology.cases.length > 0 ? (
              <div className="px-4 pb-4">
                <p className="text-[11px] font-medium tracking-[0.08em] text-ink-3 uppercase">
                  {casesLabel}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {technology.cases.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="text-sm font-medium text-brand underline-offset-4 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {technology.shownAt ? (
              <div className="px-4 pb-4">
                <Link
                  href={technology.shownAt.href}
                  className="text-sm font-medium text-brand underline-offset-4 hover:underline"
                >
                  {technology.shownAt.title} →
                </Link>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

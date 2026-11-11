"use client";

import Link from "next/link";
import { useEffect, useId, useRef, type RefObject } from "react";

import { ArrowRightIcon, CloseIcon } from "@/components/ui/icons";
import { SCENARIO_PARAM } from "@/features/playground/scenario-param";
import {
  useNodeActions,
  useStageSelection,
} from "@/features/stage/stage-provider";
import type { ScenarioId } from "@/simulation/scenarios/catalog";

import type { InspectorCopy, InspectorNode } from "./inspector-data";

interface NodeInspectorProps {
  readonly nodes: readonly InspectorNode[];
  readonly copy: InspectorCopy;
  /**
   * Runs a scenario right here (the playground). Without it, scenarios link to the playground
   * page at `playgroundPath`, which starts the scenario from its `?scenario=` parameter.
   */
  readonly onRunScenario?: (scenarioId: ScenarioId) => void;
  readonly playgroundPath?: string;
}

const sectionTitle = "font-mono text-xs tracking-[0.14em] text-ink-3 uppercase";
const scenarioClassName =
  "group flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line bg-bg px-3.5 py-2 text-left text-sm font-semibold text-ink transition-colors hover:border-brand/40 hover:bg-brand/5";

/** Sends focus back to where the visitor opened the inspector from, if it is still on the page. */
function restoreFocus(returnFocus: RefObject<HTMLElement | null>): void {
  const target = returnFocus.current;
  returnFocus.current = null;
  if (target?.isConnected) target.focus({ preventScroll: true });
}

/**
 * The node selected on the scene (or in a node list): what it is, how it is built and which
 * scenarios pass through it. A side panel on large screens, a bottom sheet on phones. It does not
 * trap focus: opening moves focus to its title, Escape or the close button dismiss it and return
 * focus to where the visitor came from (e.g. the node list).
 */
export function NodeInspector({
  nodes,
  copy,
  onRunScenario,
  playgroundPath,
}: NodeInspectorProps) {
  const selectedNodeId = useStageSelection((state) => state.selectedNodeId);
  const { select } = useNodeActions();
  const titleId = useId();
  const node = nodes.find((candidate) => candidate.id === selectedNodeId);
  const nodeId = node?.id ?? null;
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // The selection belongs to the page: leaving it closes the inspector instead of reopening it later.
  useEffect(() => () => select(null), [select]);

  useEffect(() => {
    if (!nodeId) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      !panelRef.current?.contains(active)
    )
      returnFocusRef.current = active;
    titleRef.current?.focus({ preventScroll: true });
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      select(null);
      restoreFocus(returnFocusRef);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [nodeId, select]);

  function close() {
    select(null);
    restoreFocus(returnFocusRef);
  }

  if (!node) return null;

  return (
    <aside
      key={node.id}
      ref={panelRef}
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-0 z-30 max-h-[72svh] animate-panel-in overflow-y-auto overscroll-contain rounded-t-3xl border border-line bg-surface px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[23rem] sm:rounded-3xl lg:top-24 lg:bottom-auto lg:max-h-[calc(100svh-7rem)]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="pt-2 font-mono text-xs tracking-[0.14em] text-brand uppercase">
          {copy.label} · {node.kind}
        </p>
        <button
          type="button"
          onClick={close}
          aria-label={copy.close}
          className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>

      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xl font-bold tracking-[-0.02em] text-ink"
      >
        {node.label}
        <span className="rounded-md bg-ink px-2 py-0.5 font-mono text-xs font-bold tracking-normal text-white">
          {node.tech}
        </span>
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{node.role}</p>

      <h3 className={`mt-6 ${sectionTitle}`}>{copy.practices}</h3>
      <ul className="mt-3 space-y-2.5">
        {node.practices.map((practice) => (
          <li
            key={practice}
            className="relative pl-4 text-sm leading-relaxed text-ink before:absolute before:top-[0.6em] before:left-0 before:size-1.5 before:rounded-full before:bg-brand"
          >
            {practice}
          </li>
        ))}
      </ul>

      <h3 className={`mt-6 ${sectionTitle}`}>{copy.technologies}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {node.technologies.map((technology) => (
          <li key={technology.name}>
            <Link
              href={technology.href}
              className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink-2 transition-colors hover:border-ink-3/50 hover:text-ink"
            >
              {technology.name}
            </Link>
          </li>
        ))}
      </ul>

      {node.cases.length > 0 ? (
        <>
          <h3 className={`mt-6 ${sectionTitle}`}>{copy.cases}</h3>
          <ul className="mt-3 space-y-2">
            {node.cases.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={scenarioClassName}>
                  {item.title}
                  <ArrowRightIcon className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-brand" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {node.scenarios.length > 0 ? (
        <>
          <h3 className={`mt-6 ${sectionTitle}`}>{copy.scenarios}</h3>
          <ul className="mt-3 space-y-2">
            {node.scenarios.map((scenario) => (
              <li key={scenario.id}>
                {onRunScenario ? (
                  <button
                    type="button"
                    onClick={() => onRunScenario(scenario.id)}
                    className={scenarioClassName}
                  >
                    {scenario.title}
                    <ArrowRightIcon className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-brand" />
                  </button>
                ) : playgroundPath ? (
                  <Link
                    href={`${playgroundPath}?${SCENARIO_PARAM}=${scenario.id}`}
                    className={scenarioClassName}
                  >
                    {scenario.title}
                    <ArrowRightIcon className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-brand" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}

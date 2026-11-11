"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "zustand";

import { ArrowRightIcon } from "@/components/ui/icons";
import { PlaygroundController } from "@/features/playground/playground-controller";
import { SCENARIO_PARAM } from "@/features/playground/scenario-param";
import { useScenePlayer } from "@/features/playground/use-scene-player";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { cn } from "@/lib/cn";

interface HeroRequestProps {
  readonly copy: Dictionary["home"]["hero"]["request"];
  /** Localized path of the playground, for the "inspect it" link. */
  readonly playgroundPath: string;
}

/**
 * "Send a request" in the hero: the visitor's own GET travels through the hero city (gateway, auth,
 * API, database and back) and the response appears here. It reuses the playground's simulation,
 * so pressing it repeatedly meets the real rate limiter.
 */
export function HeroRequest({ copy, playgroundPath }: HeroRequestProps) {
  const [controller] = useState(() => new PlaygroundController("sync-read"));
  const activateScene = useScenePlayer(controller);
  const activeRunId = useStore(controller.store, (state) => state.activeRunId);
  const response = useStore(controller.store, (state) => state.response);

  function send() {
    activateScene();
    controller.send();
  }

  const inFlight = activeRunId !== null && response === null;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        onClick={send}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-flow-sync/40 bg-flow-sync/10 px-4 font-mono text-sm font-semibold text-ink transition-colors hover:border-flow-sync hover:bg-flow-sync/15"
      >
        <span className="rounded bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white">
          GET
        </span>
        {copy.send}
      </button>
      <p aria-live="polite" className="min-h-6 text-sm text-ink-3">
        {response ? (
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={cn(
                "font-mono font-semibold",
                response.status < 400
                  ? "text-status-success"
                  : "text-status-failed",
              )}
            >
              {response.status} {response.statusText} · {response.latencyMs} ms
            </span>
            <Link
              href={`${playgroundPath}?${SCENARIO_PARAM}=sync-read`}
              className="inline-flex items-center gap-1 font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            >
              {copy.details}
              <ArrowRightIcon className="size-4" />
            </Link>
          </span>
        ) : inFlight ? (
          copy.inFlight
        ) : (
          copy.hint
        )}
      </p>
    </div>
  );
}

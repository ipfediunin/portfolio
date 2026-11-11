"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { PlaygroundController } from "@/features/playground/playground-controller";
import { revealScene } from "@/features/playground/reveal-scene";
import {
  PlaygroundContext,
  usePlayground,
} from "@/features/playground/use-playground";
import { useScenePlayer } from "@/features/playground/use-scene-player";
import { cn } from "@/lib/cn";
import type { DistrictEntry } from "@/simulation/stories/catalog";

interface DistrictRunner {
  readonly run: (entry: DistrictEntry) => void;
  readonly sceneRef: RefObject<HTMLDivElement | null>;
}

const DistrictContext = createContext<DistrictRunner | null>(null);

function useDistrictRunner(): DistrictRunner {
  const runner = useContext(DistrictContext);
  if (!runner)
    throw new Error(
      "District components must be rendered inside <DistrictPlayer>",
    );
  return runner;
}

/**
 * Runs a district page's scenarios on its scene: stories and playground requests share one
 * controller (and so one clock, one narration). The scene is borrowed in "visitor" mode, so the
 * district view stays as it is.
 */
export function DistrictPlayer({ children }: { readonly children: ReactNode }) {
  const [controller] = useState(() => new PlaygroundController());
  const activateScene = useScenePlayer(controller);
  const sceneRef = useRef<HTMLDivElement>(null);

  function run(entry: DistrictEntry) {
    activateScene();
    if (entry.kind === "story") {
      controller.playStory(entry.id);
    } else {
      controller.selectScenario(entry.id);
      controller.send();
    }
    revealScene(sceneRef.current);
  }

  return (
    <PlaygroundContext value={controller}>
      <DistrictContext value={{ run, sceneRef }}>{children}</DistrictContext>
    </PlaygroundContext>
  );
}

/** The scene slot of a district page; scenarios scroll it back into view on phones. */
export function DistrictScene({ children }: { readonly children: ReactNode }) {
  const { sceneRef } = useDistrictRunner();
  return (
    <div ref={sceneRef} className="scroll-mt-24">
      {children}
    </div>
  );
}

export type DistrictScenario = DistrictEntry & {
  readonly title: string;
  readonly text: string;
};

export function DistrictScenarioList({
  scenarios,
}: {
  readonly scenarios: readonly DistrictScenario[];
}) {
  const { run } = useDistrictRunner();
  const storyId = usePlayground((state) => state.storyId);
  const scenarioId = usePlayground((state) => state.scenarioId);
  const started = usePlayground((state) => state.activeRunId !== null);

  return (
    <ul className="grid gap-2">
      {scenarios.map((scenario, index) => {
        const active =
          started &&
          (scenario.kind === "story"
            ? storyId === scenario.id
            : storyId === null && scenarioId === scenario.id);
        return (
          <li key={`${scenario.kind}:${scenario.id}`}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => run(scenario)}
              className={cn(
                "flex w-full gap-3 rounded-xl border p-3 text-left transition-colors duration-200",
                active
                  ? "border-brand/40 bg-brand/5"
                  : "border-line bg-surface hover:border-ink-3/40",
              )}
            >
              <span className="font-mono text-xs text-ink-3">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block text-sm font-bold text-ink">
                  {scenario.title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">
                  {scenario.text}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

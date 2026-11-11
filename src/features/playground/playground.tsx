"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { SectionHeading } from "@/components/ui/typography";
import { siteConfig } from "@/content/site";
import type {
  InspectorCopy,
  InspectorNode,
} from "@/features/inspector/inspector-data";
import { NodeInspector } from "@/features/inspector/node-inspector";
import { NodeList } from "@/features/inspector/node-list";
import { SceneViewport } from "@/features/stage/scene-viewport";
import { useNodeActions, useStage } from "@/features/stage/stage-provider";
import { LARGE_SCREEN_QUERY } from "@/engine/types";
import type { ScenarioId } from "@/simulation/scenarios/catalog";

import { LiveApi } from "./live-api";
import { LogConsole } from "./log-console";
import { PlaybackBar } from "./playback-bar";
import { PlaygroundController } from "./playground-controller";
import { RequestComposer } from "./request-composer";
import { ResponsePanel } from "./response-panel";
import { revealScene } from "./reveal-scene";
import { readScenarioParam } from "./scenario-param";
import { ScenarioPicker } from "./scenario-picker";
import { TraceWaterfall } from "./trace-waterfall";
import { PlaygroundContext, type PlaygroundCopy } from "./use-playground";

interface PlaygroundProps {
  readonly copy: PlaygroundCopy;
  readonly sceneLabel: string;
  readonly poster: ReactNode;
  /** The system's components: a keyboard-friendly list under the playground and the inspector. */
  readonly nodes: readonly InspectorNode[];
  readonly nodesCopy: { readonly title: string; readonly lead: string };
  readonly inspectorCopy: InspectorCopy;
}

/**
 * The interactive architecture: compose a request, watch it travel through the city, read its trace,
 * logs and response. The simulation runs in the browser and works without WebGL (DOM panels only).
 *
 * DOM order is the phone order (scene first, then the composer right under it, results last); on
 * large screens grid placement moves the composer into the left column.
 */
export function Playground({
  copy,
  sceneLabel,
  poster,
  nodes,
  nodesCopy,
  inspectorCopy,
}: PlaygroundProps) {
  const [controller] = useState(
    () =>
      new PlaygroundController(
        "sync-read",
        siteConfig.liveApiUrl ? new LiveApi(siteConfig.liveApiUrl) : null,
      ),
  );
  const { connectPlayer } = useStage();
  const { select } = useNodeActions();
  const sceneRef = useRef<HTMLDivElement>(null);
  const nodesTitleId = useId();

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  useEffect(
    () => connectPlayer(controller.player, "playground"),
    [connectPlayer, controller],
  );

  // `?scenario=cache` (links from the inspector on other pages) runs that scenario once on arrival.
  useEffect(() => {
    const requested = readScenarioParam(window.location.search);
    if (!requested) return;
    window.history.replaceState(null, "", window.location.pathname);
    controller.selectScenario(requested);
    controller.send();
    revealScene(sceneRef.current);
  }, [controller]);

  function send() {
    controller.send();
    revealScene(sceneRef.current);
  }

  function runScenario(scenarioId: ScenarioId) {
    controller.selectScenario(scenarioId);
    send();
    // On phones the inspector sheet would cover the scene the run is about to play on.
    if (!window.matchMedia(LARGE_SCREEN_QUERY).matches) select(null);
  }

  return (
    <PlaygroundContext value={controller}>
      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
        <div className="space-y-5 lg:col-start-2 lg:row-start-1">
          <div ref={sceneRef} className="scroll-mt-24">
            <SceneViewport
              scene={{ world: "city", view: "system" }}
              label={sceneLabel}
              poster={poster}
              className="aspect-[4/3] w-full rounded-3xl border border-line bg-bg md:aspect-[16/10]"
            />
          </div>
          <PlaybackBar copy={copy} />
        </div>
        <div className="space-y-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <RequestComposer copy={copy} onSend={send} />
          <ScenarioPicker copy={copy} />
        </div>
        <div className="space-y-5 lg:col-start-2 lg:row-start-2">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <TraceWaterfall copy={copy} />
            <ResponsePanel copy={copy} />
          </div>
          <LogConsole copy={copy} />
        </div>
      </div>

      <section aria-labelledby={nodesTitleId} className="mt-16 lg:mt-20">
        <SectionHeading
          id={nodesTitleId}
          title={nodesCopy.title}
          lead={nodesCopy.lead}
        />
        <div className="mt-8">
          <NodeList nodes={nodes} />
        </div>
      </section>
      {/* Right after the list in DOM order, so Tab moves from a component into its inspector. */}
      <NodeInspector
        nodes={nodes}
        copy={inspectorCopy}
        onRunScenario={runScenario}
      />
    </PlaygroundContext>
  );
}

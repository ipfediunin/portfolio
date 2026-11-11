"use client";

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useStore } from "zustand";

import { ChevronDownIcon } from "@/components/ui/icons";
import { LARGE_SCREEN_QUERY, type SceneRef } from "@/engine/types";
import { Segmented } from "@/features/playground/controls";
import { revealScene } from "@/features/playground/reveal-scene";
import { useScenePlayer } from "@/features/playground/use-scene-player";
import { SceneViewport } from "@/features/stage/scene-viewport";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { cn } from "@/lib/cn";
import type { CaseRun } from "@/simulation/cases/case-script";
import { playbackSpeeds } from "@/simulation/runtime/trace-player";

import { CaseController } from "./case-controller";
import { formatTemplate } from "./format";
import { useElementHeight, useMediaQuery } from "./layout-hooks";
import { SceneEntryBubble, type SceneEntry } from "./scene-entry";

export type DemoCopy = Dictionary["projects"]["demo"];
export type { SceneEntry };

/** Everything the server page hands a case demo besides its own copy. */
export interface CaseStageInput {
  readonly scene: SceneRef;
  /** Server-rendered poster of the case world (shown before the engine and without WebGL). */
  readonly poster: ReactNode;
  readonly label: string;
  readonly copy: DemoCopy;
  readonly locale: Locale;
  /** The case header (back link, eyebrow, title, subtitle): floats over the world on desktops. */
  readonly title: ReactNode;
  /** Summary, basis, links and what I did: after the title on phones, under the world on desktops. */
  readonly intro: ReactNode;
  /** Before, after and the charts: a strip over the bottom of the world on desktops. */
  readonly glance: ReactNode;
}

interface CaseDemo<Key extends string> {
  readonly controller: CaseController<Key>;
  readonly sceneRef: RefObject<HTMLDivElement | null>;
  /** Compiles a run with the next start time and sequence, then plays it on the scene. */
  readonly play: (
    compile: (next: ReturnType<CaseController<Key>["nextRun"]>) => CaseRun<Key>,
  ) => void;
}

/**
 * A case demo's controller and the scene it borrows. Runs use "playground" mode: the world's
 * ambient status cards step aside, because the run's own cards are the explanation.
 */
export function useCaseDemo<Key extends string>(): CaseDemo<Key> {
  const [controller] = useState(() => new CaseController<Key>());
  const activateScene = useScenePlayer(controller, "playground");
  const sceneRef = useRef<HTMLDivElement>(null);
  const play = useCallback<CaseDemo<Key>["play"]>(
    (compile) => {
      activateScene();
      controller.play(compile(controller.nextRun()));
      revealScene(sceneRef.current);
    },
    [activateScene, controller],
  );
  return { controller, sceneRef, play };
}

const buttonClassName =
  "h-10 rounded-xl border border-line bg-bg px-4 text-sm font-semibold text-ink transition-colors hover:border-ink-3/50 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Desktop geometry in CSS pixels (16 px rem). The camera and the cards keep out of the space the
 * overlays take; a change re-frames the world with a short flight.
 */
const EDGE = 24; // lg:m-6 / lg:p-6 around every overlay
const PANEL_WIDTH = 432; // lg:w-[27rem]
const HANDLE = 40; // size-10, at ml-3 right of the panel
const PANEL_INSET = EDGE + PANEL_WIDTH + EDGE;
const COLLAPSED_INSET = 12 + HANDLE + EDGE;
const GLANCE_TOGGLE = 36; // h-9
const GAP = 12;
/**
 * Where the glance strip starts open: wide and tall enough to leave the world room. Mirrors the
 * `glance-folded` CSS variant (globals.css), which folds it before hydration.
 */
const ROOMY_QUERY = "(min-width: 1280px) and (min-height: 900px)";

/**
 * A case page's stage. Phones get one column — title, intro, glance, the world, playback, the demo's
 * panels. Desktops get the world across the whole first screen with everything else floating over
 * it in glass: the title at the top centre, the glance strip along the bottom and the demo panel
 * on the left; the panel and the strip slide away to give the world the whole screen. One DOM order
 * serves both (grid placement, not CSS order): the overlays share the world's grid cell.
 */
export function CaseStage<Key extends string>({
  demo,
  input,
  captions,
  idleCaption,
  entry,
  children,
}: {
  readonly demo: CaseDemo<Key>;
  readonly input: CaseStageInput;
  readonly captions: Readonly<Record<Key, string>>;
  readonly idleCaption: string;
  /** The building the demo can be started from, with the panel's main action. */
  readonly entry?: SceneEntry;
  readonly children: ReactNode;
}) {
  const { controller, sceneRef } = demo;
  const { copy, locale } = input;
  const caption = useStore(controller.store, (state) => state.caption);
  const running = useStore(controller.store, (state) => state.running);
  const paused = useStore(controller.store, (state) => state.paused);
  const speed = useStore(controller.store, (state) => state.speed);

  const large = useMediaQuery(LARGE_SCREEN_QUERY, true);
  // The bubble duplicates the panel's main control, so it is never in the server HTML: it appears
  // after hydration, on desktops only.
  const bubbleAllowed = useMediaQuery(LARGE_SCREEN_QUERY, false);
  const roomy = useMediaQuery(ROOMY_QUERY, true);
  const [panelOpen, setPanelOpen] = useState(true);
  /** null: the strip follows the screen (open where there is room) until the visitor chooses. */
  const [glanceChoice, setGlanceChoice] = useState<boolean | null>(null);
  const glanceOpen = glanceChoice ?? roomy;
  const titleRef = useRef<HTMLDivElement>(null);
  const glanceRef = useRef<HTMLDivElement>(null);
  const titleHeight = useElementHeight(titleRef);
  const glanceHeight = useElementHeight(glanceRef);
  const panelId = useId();
  const glanceId = useId();

  const left = panelOpen ? PANEL_INSET : COLLAPSED_INSET;
  const top = titleHeight > 0 ? EDGE + titleHeight + GAP : 0;
  const bottom =
    EDGE + GLANCE_TOGGLE + GAP + (glanceOpen ? glanceHeight + GAP : 0);
  const insets = useMemo(
    () => ({
      left: `${left}px` as const,
      top: `${top}px` as const,
      bottom: `${bottom}px` as const,
    }),
    [left, top, bottom],
  );
  const entryBounds = useMemo(() => ({ left, top }), [left, top]);

  const overlay =
    "lg:col-start-1 lg:row-start-1 lg:pr-6 lg:pl-[var(--stage-left)] lg:transition-[padding] lg:duration-500 lg:ease-ui";
  const glass =
    "lg:rounded-3xl lg:border lg:border-white/60 lg:bg-surface/60 lg:shadow-card lg:backdrop-blur-xl";

  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-rows-[clamp(38rem,calc(100svh-5rem),60rem)_auto] lg:gap-0"
      style={{ "--stage-left": `${left}px` } as CSSProperties}
    >
      <div
        className={cn(
          "relative z-10 lg:pointer-events-none lg:self-start lg:pt-6",
          overlay,
        )}
      >
        <div
          ref={titleRef}
          className={cn(
            "lg:pointer-events-auto lg:mx-auto lg:w-fit lg:max-w-2xl lg:animate-rise-in lg:px-7 lg:py-3.5 lg:text-center",
            glass,
          )}
        >
          {input.title}
        </div>
      </div>

      <div className="lg:col-start-1 lg:row-start-2 lg:mx-auto lg:w-full lg:max-w-7xl lg:px-8 lg:pt-14">
        {input.intro}
      </div>

      <div
        className={cn(
          "relative z-10 lg:pointer-events-none lg:flex lg:flex-col lg:items-end lg:self-end lg:pb-6",
          overlay,
        )}
      >
        <button
          type="button"
          aria-expanded={glanceOpen}
          aria-controls={glanceId}
          onClick={() => setGlanceChoice(!glanceOpen)}
          className="pointer-events-auto hidden h-9 items-center gap-2 rounded-full border border-white/70 bg-surface/80 px-4 font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-2 uppercase shadow-card backdrop-blur-xl transition-colors hover:text-ink lg:inline-flex"
        >
          {copy.glance}
          <ChevronDownIcon
            className={cn(
              "size-4 transition-transform duration-300 ease-ui",
              !glanceOpen && "rotate-180",
            )}
          />
        </button>
        <div
          id={glanceId}
          data-glance={
            glanceChoice === null ? "auto" : glanceOpen ? "open" : "closed"
          }
          inert={large && !glanceOpen}
          className="grid w-full lg:mt-3 lg:grid-rows-[1fr] lg:transition-[grid-template-rows,opacity,translate] lg:duration-500 lg:ease-ui lg:data-[glance=closed]:translate-y-4 lg:data-[glance=closed]:grid-rows-[0fr] lg:data-[glance=closed]:opacity-0 glance-folded:data-[glance=auto]:translate-y-4 glance-folded:data-[glance=auto]:grid-rows-[0fr] glance-folded:data-[glance=auto]:opacity-0"
        >
          {/* Clipped for the fold, with room for the cards' shadows. */}
          <div className="min-h-0 lg:overflow-clip lg:[overflow-clip-margin:1rem]">
            <div ref={glanceRef} className="lg:pointer-events-auto">
              {input.glance}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:sr-only">
        <h2
          id="demo-heading"
          className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase"
        >
          {copy.title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">
          {copy.lead}
        </p>
      </div>

      <div
        ref={sceneRef}
        className="scroll-mt-24 lg:col-start-1 lg:row-start-1 lg:border-y lg:border-line lg:bg-bg"
      >
        <SceneViewport
          scene={input.scene}
          label={input.label}
          poster={input.poster}
          focusInsetsLarge={insets}
          className="aspect-[4/3] w-full rounded-3xl border border-line bg-bg lg:aspect-auto lg:h-full lg:rounded-none lg:border-0"
        >
          {/* Phones keep their layout: the demo's panel sits right under the small scene. */}
          {entry && bubbleAllowed ? (
            <SceneEntryBubble
              entry={entry}
              label={copy.tryHere}
              hidden={running}
              bounds={entryBounds}
            />
          ) : null}
        </SceneViewport>
      </div>

      <div
        data-open={panelOpen}
        className="relative z-10 min-w-0 lg:col-start-1 lg:row-start-1 lg:my-6 lg:ml-6 lg:w-[27rem] lg:justify-self-start lg:transition-transform lg:duration-500 lg:ease-ui lg:data-[open=false]:-translate-x-[calc(100%+1.5rem)]"
      >
        <div
          id={panelId}
          inert={large && !panelOpen}
          className={cn(
            "space-y-6 lg:h-full lg:space-y-4 lg:overflow-y-auto lg:bg-surface/55 lg:p-4 lg:transition-opacity lg:duration-500",
            glass,
            !panelOpen && "lg:opacity-0",
          )}
        >
          <section
            aria-label={copy.playback}
            className="rounded-2xl border border-line bg-surface p-4 sm:p-5 lg:bg-surface/85"
          >
            <p className="font-mono text-xs tracking-[0.14em] text-brand uppercase">
              {copy.whatHappens}
            </p>
            <p
              aria-live="polite"
              className="mt-2 min-h-12 text-sm leading-relaxed text-ink"
            >
              {caption
                ? formatTemplate(captions[caption.key], caption.values, locale)
                : idleCaption}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!running}
                onClick={() => controller.togglePause()}
                className={buttonClassName}
              >
                {paused ? copy.play : copy.pause}
              </button>
              <div className="w-40">
                <Segmented
                  label={copy.speed}
                  value={speed}
                  options={playbackSpeeds.map((value) => ({
                    value,
                    label: `${value}×`,
                  }))}
                  onChange={(value) => controller.setSpeed(value)}
                />
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              {copy.simulated}
            </p>
          </section>
          {children}
        </div>
        <button
          type="button"
          aria-expanded={panelOpen}
          aria-controls={panelId}
          aria-label={panelOpen ? copy.hidePanel : copy.showPanel}
          title={panelOpen ? copy.hidePanel : copy.showPanel}
          onClick={() => setPanelOpen(!panelOpen)}
          className="absolute top-1/2 left-full ml-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-surface/85 text-ink shadow-card backdrop-blur-xl transition-colors hover:text-brand lg:grid"
        >
          <ChevronDownIcon
            className={cn(
              "size-5 transition-transform duration-500 ease-ui",
              panelOpen ? "rotate-90" : "-rotate-90",
            )}
          />
        </button>
      </div>
    </div>
  );
}

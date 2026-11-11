"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { FocusInsetSide } from "@/engine/camera/focus-inset";
import {
  FOCUS_INSET_ATTRIBUTES,
  type FocusInsetValue,
  type SceneRef,
} from "@/engine/types";
import { cn } from "@/lib/cn";

import { useStage } from "./stage-provider";

/** How much of each side page content covers on large screens. */
export type FocusInsetsLarge = Partial<Record<FocusInsetSide, FocusInsetValue>>;

interface SceneViewportProps {
  /** World and camera view this slot shows: the city's hero shot or a district, or a case world. */
  readonly scene: SceneRef;
  /** Text alternative for the scene; everything it shows is also available as page content. */
  readonly label: string;
  /** Static stand-in (usually the server-rendered <ScenePoster />) shown until the engine is live. */
  readonly poster: ReactNode;
  /** Must give the slot a size (e.g. an aspect ratio) so the canvas never causes layout shift. */
  readonly className?: string;
  /**
   * How much of each side page content covers on large screens — a share of the axis (0..1) or a
   * fixed size in pixels — so the camera frames the scene in the rest. A change re-frames it.
   */
  readonly focusInsetsLarge?: FocusInsetsLarge;
  /** Page content pinned over the scene (positioned against the slot, above the canvas). */
  readonly children?: ReactNode;
}

const cssLength = (value: FocusInsetValue | undefined) =>
  typeof value === "string" ? value : `${(value ?? 0) * 100}%`;

/** A slot on the page where the shared scene canvas is mounted. */
export function SceneViewport({
  scene,
  label,
  poster,
  className,
  focusInsetsLarge = {},
  children,
}: SceneViewportProps) {
  const id = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const { status, activeViewportId, registerViewport, setViewportScene } =
    useStage();
  // Registration reads the first scene; later changes go through setViewportScene (a camera flight).
  const initialSceneRef = useRef(scene);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return registerViewport(id, host, initialSceneRef.current);
  }, [id, registerViewport]);

  // Pages pass a fresh object on every render; an unchanged world and view is ignored there.
  useEffect(() => {
    setViewportScene(id, scene);
  }, [id, scene, setViewportScene]);

  const live = status === "ready" && activeViewportId === id;
  const insetAttributes = Object.fromEntries(
    Object.entries(FOCUS_INSET_ATTRIBUTES).flatMap(([side, attribute]) => {
      const value = focusInsetsLarge[side as FocusInsetSide];
      return value === undefined ? [] : [[attribute, String(value)]];
    }),
  );

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div role="img" aria-label={label} className="absolute inset-0">
        {/* The poster keeps out of the same insets as the camera, so the crossfade does not jump. */}
        <div
          className={cn(
            "absolute inset-0 transition-[opacity,inset] duration-700 ease-ui lg:inset-[var(--inset-top)_var(--inset-right)_var(--inset-bottom)_var(--inset-left)]",
            live && "opacity-0",
          )}
          style={
            {
              "--inset-top": cssLength(focusInsetsLarge.top),
              "--inset-right": cssLength(focusInsetsLarge.right),
              "--inset-bottom": cssLength(focusInsetsLarge.bottom),
              "--inset-left": cssLength(focusInsetsLarge.left),
            } as CSSProperties
          }
        >
          {poster}
        </div>
        <div
          ref={hostRef}
          data-scene-host=""
          {...insetAttributes}
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-ui",
            live ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
      {children}
    </div>
  );
}

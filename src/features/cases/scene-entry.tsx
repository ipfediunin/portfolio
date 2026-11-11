"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ArrowRightIcon } from "@/components/ui/icons";
import type { NodeAnchor } from "@/engine/types";
import { useStage } from "@/features/stage/stage-provider";
import { cn } from "@/lib/cn";

/**
 * The building a demo can be driven from, with the same action as the demo's panel: a short
 * message to type (a question, a chat message) or one button (run the batch, read an order).
 */
export type SceneEntry =
  | {
      readonly kind: "text";
      readonly nodeId: string;
      readonly placeholder: string;
      readonly submitLabel: string;
      readonly maxLength: number;
      readonly onSubmit: (text: string) => void;
    }
  | {
      readonly kind: "action";
      readonly nodeId: string;
      readonly actionLabel: string;
      readonly onAction: () => void;
    };

/** Room for the building's own name tag (22 px) and a gap between it and the bubble's tail. */
const NAME_TAG_CLEARANCE = 32;
/** Beside the building: past half a typical name tag, so the name stays readable. */
const SIDE_GAP = 72;
const EDGE = 8;

/**
 * A small bubble pinned above the send-point building (the engine rings the building itself), so
 * the demo can be started right on the world. It follows the camera through `trackNode` and moves
 * by transform on animation frames, without re-rendering; it stays inside the free part of the
 * scene (`bounds`) and steps aside while a run plays, when the run's own cards take its place.
 */
export function SceneEntryBubble({
  entry,
  label,
  hidden,
  bounds,
}: {
  readonly entry: SceneEntry;
  /** Caption above the control: "Try it here". */
  readonly label: string;
  readonly hidden: boolean;
  /** Left and top edges of the free part of the scene, in slot pixels. */
  readonly bounds: { readonly left: number; readonly top: number };
}) {
  const { trackNode, markNode } = useStage();
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<NodeAnchor | null>(null);
  const boundsRef = useRef(bounds);
  const sizeRef = useRef({ slotWidth: 0, width: 0, height: 0 });
  const [text, setText] = useState("");

  /** Places the bubble from cached sizes only: no layout reads on camera frames. */
  const place = useCallback(() => {
    const element = ref.current;
    const anchor = anchorRef.current;
    if (!element) return;
    const { slotWidth, width, height } = sizeRef.current;
    if (!anchor || width === 0) {
      element.dataset.anchored = "false";
      return;
    }
    const { left, top } = boundsRef.current;
    const clampX = (x: number) =>
      Math.min(Math.max(x, left + EDGE), slotWidth - EDGE - width);
    const naturalTop = anchor.y - NAME_TAG_CLEARANCE - height;
    let x: number;
    let y: number;
    if (naturalTop >= top + EDGE) {
      // Above the building, the tail pointing at its name.
      x = clampX(anchor.x - width / 2);
      y = naturalTop;
      element.style.setProperty(
        "--tail-x",
        `${Math.round(Math.min(Math.max(anchor.x - x, 16), width - 16))}px`,
      );
      element.dataset.tail = "on";
    } else {
      // No room above (the title is there): beside the building's name, left if it fits.
      y = Math.max(top + EDGE, anchor.y - height / 2 - NAME_TAG_CLEARANCE / 2);
      const leftSide = anchor.x - SIDE_GAP - width;
      x = clampX(leftSide >= left + EDGE ? leftSide : anchor.x + SIDE_GAP);
      element.dataset.tail = "off";
    }
    element.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    element.dataset.anchored = "true";
  }, []);

  useEffect(() => {
    boundsRef.current = bounds;
    place();
  }, [bounds, place]);

  useEffect(() => {
    const element = ref.current;
    const slot = element?.parentElement;
    if (!element || !slot) return;
    const observer = new ResizeObserver(() => {
      sizeRef.current = {
        slotWidth: slot.clientWidth,
        width: element.offsetWidth,
        height: element.offsetHeight,
      };
      place();
    });
    observer.observe(element);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [place]);

  useEffect(() => {
    markNode(entry.nodeId);
    return () => markNode(null);
  }, [entry.nodeId, markNode]);

  useEffect(
    () =>
      trackNode(entry.nodeId, (anchor) => {
        anchorRef.current = anchor;
        place();
      }),
    [entry.nodeId, place, trackNode],
  );

  const control =
    entry.kind === "text" ? (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const message = text.trim();
          if (!message) return;
          entry.onSubmit(message);
          setText("");
        }}
        className="flex items-center gap-1.5"
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={entry.maxLength}
          placeholder={entry.placeholder}
          aria-label={entry.placeholder}
          className="h-9 w-44 min-w-0 rounded-xl border border-line bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:border-brand sm:w-52"
        />
        <button
          type="submit"
          aria-label={entry.submitLabel}
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-brand transition-transform duration-200 ease-ui hover:-translate-y-px disabled:opacity-50"
          disabled={text.trim().length === 0}
        >
          <ArrowRightIcon className="size-4" strokeWidth={2.25} />
        </button>
      </form>
    ) : (
      <button
        type="button"
        onClick={entry.onAction}
        className="h-9 rounded-xl bg-brand px-4 text-sm font-semibold whitespace-nowrap text-white shadow-brand transition-transform duration-200 ease-ui hover:-translate-y-px"
      >
        {entry.actionLabel}
      </button>
    );

  return (
    <div
      ref={ref}
      data-anchored="false"
      data-tail="on"
      inert={hidden}
      className={cn(
        "group/entry absolute top-0 left-0 z-[5] will-change-transform data-[anchored=false]:pointer-events-none data-[anchored=false]:opacity-0",
        "transition-opacity duration-300 ease-ui",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      <div className="relative rounded-2xl border border-white/70 bg-surface/90 p-2 shadow-card backdrop-blur-xl group-data-[anchored=true]/entry:animate-rise-in">
        <p className="flex items-center gap-1.5 px-1 pb-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-brand uppercase">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/60" />
            <span className="relative size-2 rounded-full bg-brand" />
          </span>
          {label}
        </p>
        {control}
        <span
          aria-hidden="true"
          className="absolute top-full left-[var(--tail-x)] size-3 -translate-x-1/2 -translate-y-1.5 rotate-45 border-r border-b border-white/70 bg-surface/90 group-data-[tail=off]/entry:hidden"
        />
      </div>
    </div>
  );
}

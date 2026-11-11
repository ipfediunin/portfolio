import { NO_INSETS, type FocusInsets } from "./focus-inset";

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/** World → screen transform: screen = world * scale + offset. */
export interface Framing {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

interface FitOptions {
  /** Minimum free space around the content, in screen pixels. */
  readonly padding?: number;
  /** Upper zoom limit, so a small scene in a large viewport is not blown up. */
  readonly maxScale?: number;
  /** Screen pixels on each side reserved for overlapping page content (hero copy, demo panels). */
  readonly insets?: FocusInsets;
}

/** "Contain" strategy: the whole content is visible and centered in the free part of the viewport. */
export function fitContain(
  content: Bounds,
  viewport: ViewportSize,
  {
    padding = 0,
    maxScale = Number.POSITIVE_INFINITY,
    insets = NO_INSETS,
  }: FitOptions = {},
): Framing {
  const regionWidth = Math.max(viewport.width - insets.left - insets.right, 1);
  const regionHeight = Math.max(
    viewport.height - insets.top - insets.bottom,
    1,
  );
  const availableWidth = Math.max(regionWidth - padding * 2, 1);
  const availableHeight = Math.max(regionHeight - padding * 2, 1);
  const scale = Math.min(
    availableWidth / content.width,
    availableHeight / content.height,
    maxScale,
  );

  return {
    scale,
    offsetX:
      insets.left +
      (regionWidth - content.width * scale) / 2 -
      content.x * scale,
    offsetY:
      insets.top +
      (regionHeight - content.height * scale) / 2 -
      content.y * scale,
  };
}

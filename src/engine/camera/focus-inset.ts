/** No single side may take more than this share of its axis. */
const MAX_INSET_SHARE = 0.6;
/** Opposite sides together always leave the scene at least this share of the axis. */
const MIN_FREE_SHARE = 0.35;

/** Screen pixels on each side of the viewport that page content covers. */
export interface FocusInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: FocusInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export const focusInsetSides = ["top", "right", "bottom", "left"] as const;
export type FocusInsetSide = (typeof focusInsetSides)[number];

/**
 * One side's inset from a slot attribute: a share of the axis ("0.3") or pixels ("480px"), capped
 * so the scene always keeps part of the viewport. Missing or malformed means no inset.
 */
export function parseFocusInset(value: string | null, extent: number): number {
  if (!value) return 0;
  const pixels = value.endsWith("px");
  const amount = Number(pixels ? value.slice(0, -2) : value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(pixels ? amount : amount * extent, extent * MAX_INSET_SHARE);
}

/** Opposite insets that would squeeze the scene too much shrink in proportion. */
function fitAxis(
  first: number,
  second: number,
  extent: number,
): readonly [number, number] {
  const allowed = extent * (1 - MIN_FREE_SHARE);
  const total = first + second;
  if (total <= allowed || total === 0) return [first, second];
  const factor = allowed / total;
  return [first * factor, second * factor];
}

/** Reads every side (`read` returns the attribute value of a side) for a viewport of `size`. */
export function resolveFocusInsets(
  read: (side: FocusInsetSide) => string | null,
  size: { readonly width: number; readonly height: number },
): FocusInsets {
  const [left, right] = fitAxis(
    parseFocusInset(read("left"), size.width),
    parseFocusInset(read("right"), size.width),
    size.width,
  );
  const [top, bottom] = fitAxis(
    parseFocusInset(read("top"), size.height),
    parseFocusInset(read("bottom"), size.height),
    size.height,
  );
  return { top, right, bottom, left };
}

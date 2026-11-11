import type { Framing } from "./fit";

/** Camera flight between two framings, e.g. from one district to another. */
export const FLIGHT_MS = 900;

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Framing at progress `t` (0..1). The world point under `pivot` (a screen point, usually the centre
 * of the free part of the viewport) moves in a straight line while the zoom changes geometrically,
 * so the flight neither drifts sideways nor feels faster at one end.
 */
export function interpolateFraming(
  from: Framing,
  to: Framing,
  t: number,
  pivot: { readonly x: number; readonly y: number },
): Framing {
  const scale = Math.exp(
    Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * t,
  );
  const fromX = (pivot.x - from.offsetX) / from.scale;
  const fromY = (pivot.y - from.offsetY) / from.scale;
  const toX = (pivot.x - to.offsetX) / to.scale;
  const toY = (pivot.y - to.offsetY) / to.scale;
  const worldX = fromX + (toX - fromX) * t;
  const worldY = fromY + (toY - fromY) * t;
  return {
    scale,
    offsetX: pivot.x - worldX * scale,
    offsetY: pivot.y - worldY * scale,
  };
}

import type { Bounds } from "../camera/fit";
import { tileToWorld } from "./projection";

export interface TileArea {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** World-space bounding box of a tile rectangle, extended upward by `topOverhang` (tallest building). */
export function tileAreaBounds(
  { x0, y0, x1, y1 }: TileArea,
  topOverhang = 0,
): Bounds {
  const left = tileToWorld(x0, y1).x;
  const right = tileToWorld(x1, y0).x;
  const top = tileToWorld(x0, y0).y - topOverhang;
  const bottom = tileToWorld(x1, y1).y;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

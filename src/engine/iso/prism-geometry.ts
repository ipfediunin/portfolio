import { tileToWorld, type Point2 } from "./projection";

/** An axis-aligned box standing on the tile grid. */
export interface PrismFootprint {
  readonly tileX: number;
  readonly tileY: number;
  /** Size along the tile x axis, in tiles. */
  readonly width: number;
  /** Size along the tile y axis, in tiles. */
  readonly depth: number;
  /** Height in world pixels. */
  readonly height: number;
  /** Base elevation above the ground in world pixels (e.g. standing on a plinth). */
  readonly elevation?: number;
}

/** Flat [x0, y0, x1, y1, …] polygons of the three faces visible from the camera (mutable: PixiJS takes number[]). */
export interface PrismFaces {
  readonly top: number[];
  readonly left: number[];
  readonly right: number[];
}

export function prismFaces({
  tileX,
  tileY,
  width,
  depth,
  height,
  elevation = 0,
}: PrismFootprint): PrismFaces {
  const back = tileToWorld(tileX, tileY);
  const right = tileToWorld(tileX + width, tileY);
  const front = tileToWorld(tileX + width, tileY + depth);
  const left = tileToWorld(tileX, tileY + depth);
  const base = elevation;
  const top = elevation + height;

  // prettier-ignore
  return {
    top: [
      back.x, back.y - top,
      right.x, right.y - top,
      front.x, front.y - top,
      left.x, left.y - top,
    ],
    left: [
      left.x, left.y - base,
      front.x, front.y - base,
      front.x, front.y - top,
      left.x, left.y - top,
    ],
    right: [
      front.x, front.y - base,
      right.x, right.y - base,
      right.x, right.y - top,
      front.x, front.y - top,
    ],
  };
}

/** A visible side face: its bottom edge runs from `from` to `to` at `base` elevation. */
export interface FaceFrame {
  readonly from: Point2;
  readonly to: Point2;
  readonly base: number;
  readonly height: number;
  /** Face length in tiles; used to choose how many window columns fit. */
  readonly lengthTiles: number;
}

/** "left" is the front-left face (along x at max y), "right" the front-right face (along y at max x). */
export function faceFrame(
  { tileX, tileY, width, depth, height, elevation = 0 }: PrismFootprint,
  face: "left" | "right",
): FaceFrame {
  return face === "left"
    ? {
        from: tileToWorld(tileX, tileY + depth),
        to: tileToWorld(tileX + width, tileY + depth),
        base: elevation,
        height,
        lengthTiles: width,
      }
    : {
        from: tileToWorld(tileX + width, tileY + depth),
        to: tileToWorld(tileX + width, tileY),
        base: elevation,
        height,
        lengthTiles: depth,
      };
}

/** Quad on a face between fractions t0..t1 along the bottom edge and lifts h0..h1 above the face base. */
export function faceQuad(
  frame: FaceFrame,
  t0: number,
  t1: number,
  h0: number,
  h1: number,
): number[] {
  const { from, to, base } = frame;
  const x = (t: number) => from.x + (to.x - from.x) * t;
  const y = (t: number, lift: number) =>
    from.y + (to.y - from.y) * t - base - lift;
  return [
    x(t0),
    y(t0, h0),
    x(t1),
    y(t1, h0),
    x(t1),
    y(t1, h1),
    x(t0),
    y(t0, h1),
  ];
}

/** Flat polygon of a tile-aligned rectangle lying at `elevation` (ground, plate or roof). */
export function groundQuad(
  tileX: number,
  tileY: number,
  width: number,
  depth: number,
  elevation = 0,
): number[] {
  const back = tileToWorld(tileX, tileY);
  const right = tileToWorld(tileX + width, tileY);
  const front = tileToWorld(tileX + width, tileY + depth);
  const left = tileToWorld(tileX, tileY + depth);
  // prettier-ignore
  return [
    back.x, back.y - elevation,
    right.x, right.y - elevation,
    front.x, front.y - elevation,
    left.x, left.y - elevation,
  ];
}

/** Projects a polygon given in tile space onto a horizontal plane at `elevation`. */
export function projectTilePolygon(
  points: readonly Point2[],
  elevation = 0,
): number[] {
  return points.flatMap((point) => {
    const world = tileToWorld(point.x, point.y);
    return [world.x, world.y - elevation];
  });
}

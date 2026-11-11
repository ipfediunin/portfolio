import type {
  NodeKind,
  NodeSpec,
  TilePoint,
  VehicleRoute,
} from "../model/graph";

/**
 * Small helpers for the case worlds. Every case world is a crossroads: one road along x and one
 * along y split the map into four blocks, buildings stand in the blocks and links run between
 * building centres along the grid, the way the city's links do.
 */

export function building(
  id: string,
  kind: NodeKind,
  label: string,
  tech: string,
  tile: TilePoint,
  size: number,
  height: number,
  floors?: number,
): NodeSpec {
  return {
    id,
    kind,
    label,
    tech,
    tile,
    footprint: { width: size, depth: size },
    height,
    ...(floors ? { floors } : {}),
  };
}

export function centre(node: NodeSpec, offset: TilePoint = { x: 0, y: 0 }) {
  return {
    x: round(node.tile.x + node.footprint.width / 2 + offset.x),
    y: round(node.tile.y + node.footprint.depth / 2 + offset.y),
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A route from `from` to `to` that leaves along `axis` onto a lane and enters the target the same
 * way: with axis "x" the lane is the horizontal line y = `lane`, with "y" the vertical x = `lane`.
 * Points that coincide are merged, so a straight link stays a two-point route.
 */
export function viaLane(
  from: TilePoint,
  to: TilePoint,
  axis: "x" | "y",
  lane: number,
): TilePoint[] {
  const points =
    axis === "x"
      ? [from, { x: from.x, y: lane }, { x: to.x, y: lane }, to]
      : [from, { x: lane, y: from.y }, { x: lane, y: to.y }, to];
  return points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1]!.x ||
      point.y !== points[index - 1]!.y,
  );
}

/** Two lanes per road, the way the city drives: road row `line` holds lanes at +0.3 and +0.7. */
export function roadTraffic(
  id: string,
  axis: "x" | "y",
  line: number,
  span: readonly [number, number],
  counts: readonly [number, number],
): VehicleRoute[] {
  const [start, end] = span;
  const lane = (offset: number, from: number, to: number) =>
    axis === "x"
      ? [
          { x: from, y: line + offset },
          { x: to, y: line + offset },
        ]
      : [
          { x: line + offset, y: from },
          { x: line + offset, y: to },
        ];
  return [
    {
      id: `${id}-forward`,
      livery: "white",
      points: lane(0.7, start, end),
      count: counts[0],
      speed: 0.7,
      phase: 0.15,
    },
    {
      id: `${id}-back`,
      livery: "violet",
      points: lane(0.3, end, start),
      count: counts[1],
      speed: 0.6,
      phase: 0.55,
    },
  ];
}

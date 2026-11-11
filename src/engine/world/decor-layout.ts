import {
  expandRect,
  nodeRect,
  rectsOverlap,
  roadRect,
  type NodeSpec,
  type WorldGraph,
  type TilePoint,
  type TileRect,
} from "@/simulation/model/graph";
import { SeededRng } from "@/simulation/runtime/seeded-rng";

/** Grass around each building extends this far past its footprint. */
export const GRASS_MARGIN = 0.28;
const BUILDING_CLEARANCE = 0.32;
const ROAD_CLEARANCE = 0.22;
const LINK_CLEARANCE = 0.2;
const TREE_SPACING = 0.42;
/** Background city around the map, visible where the scene fades out. */
const SURROUND = 7;
const FILLER_STEP = 2.3;
const FILLER_ROAD_CLEARANCE = 0.35;
/** Background buildings keep this much room around the system's buildings and street-level links. */
const FILLER_NODE_CLEARANCE = 0.9;
const FILLER_LINK_CLEARANCE = 0.45;

export interface TreePlacement {
  readonly x: number;
  readonly y: number;
  /** Index into TREE_SIZES. */
  readonly size: number;
}

export interface Decor {
  /**
   * Anonymous background buildings: no label, no card, not part of the system. They stay out of the
   * system core (as composed for the hero and the playground) and give the districts room.
   */
  readonly fillers: readonly NodeSpec[];
  readonly trees: readonly TreePlacement[];
}

function insideRect(point: TilePoint, rect: TileRect): boolean {
  return (
    point.x > rect.x0 &&
    point.x < rect.x1 &&
    point.y > rect.y0 &&
    point.y < rect.y1
  );
}

function distanceToSegment(
  point: TilePoint,
  a: TilePoint,
  b: TilePoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
          ),
        );
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/** Thin rectangles around a link's axis-aligned segments. */
function linkCorridors(graph: WorldGraph): TileRect[] {
  return graph.links
    .filter((link) => link.shape !== "arc")
    .flatMap((link) =>
      link.route.slice(1).map((to, index) => {
        const from = link.route[index]!;
        return expandRect(
          {
            x0: Math.min(from.x, to.x),
            y0: Math.min(from.y, to.y),
            x1: Math.max(from.x, to.x),
            y1: Math.max(from.y, to.y),
          },
          FILLER_LINK_CLEARANCE,
        );
      }),
    );
}

function placeFillers(graph: WorldGraph, rng: SeededRng): NodeSpec[] {
  const blocked = [
    graph.views.system.area,
    ...graph.nodes.map((node) =>
      expandRect(nodeRect(node), FILLER_NODE_CLEARANCE),
    ),
    ...graph.roads.map((road) =>
      expandRect(roadRect(road), FILLER_ROAD_CLEARANCE),
    ),
    ...linkCorridors(graph),
  ];
  const fillers: NodeSpec[] = [];

  for (let x = -SURROUND; x < graph.size.width + SURROUND; x += FILLER_STEP) {
    for (
      let y = -SURROUND;
      y < graph.size.height + SURROUND;
      y += FILLER_STEP
    ) {
      if (!rng.chance(0.42)) continue;
      const size = rng.range(1.1, 1.7);
      const rect: TileRect = {
        x0: x + rng.range(0, FILLER_STEP - size),
        y0: y + rng.range(0, FILLER_STEP - size),
        x1: 0,
        y1: 0,
      };
      const footprint = { width: size, depth: size * rng.range(0.85, 1.15) };
      const bounds = {
        ...rect,
        x1: rect.x0 + footprint.width,
        y1: rect.y0 + footprint.depth,
      };
      if (blocked.some((rect) => rectsOverlap(bounds, rect))) continue;

      const height = rng.range(22, 58);
      fillers.push({
        id: `filler.${fillers.length}`,
        kind: "service",
        label: "",
        tech: "",
        tile: { x: bounds.x0, y: bounds.y0 },
        footprint,
        height,
        floors: Math.max(2, Math.round(height / 17)),
      });
    }
  }
  return fillers;
}

/**
 * Deterministic decor: background buildings around the map, then trees on grass corners and
 * scattered inside blocks — never on roads, buildings or data links. Pure, so it is unit-tested
 * and identical on every load and in the server-rendered poster.
 */
export function planDecor(graph: WorldGraph, seed = 7): Decor {
  const rng = new SeededRng(seed);
  const fillers = placeFillers(graph, rng);
  const allBuildings = [...graph.nodes, ...fillers];
  const buildings = allBuildings.map((node) =>
    expandRect(nodeRect(node), BUILDING_CLEARANCE),
  );
  const roads = graph.roads.map((road) =>
    expandRect(roadRect(road), ROAD_CLEARANCE),
  );
  const area: TileRect = {
    x0: -SURROUND,
    y0: -SURROUND,
    x1: graph.size.width + SURROUND,
    y1: graph.size.height + SURROUND,
  };
  const trees: TreePlacement[] = [];
  // Arcs fly above the city, so only street-level links keep trees away.
  const groundLinks = graph.links.filter((link) => link.shape !== "arc");

  const isFree = (point: TilePoint) =>
    insideRect(point, area) &&
    !buildings.some((rect) => insideRect(point, rect)) &&
    !roads.some((rect) => insideRect(point, rect)) &&
    !groundLinks.some((link) =>
      link.route
        .slice(1)
        .some(
          (to, index) =>
            distanceToSegment(point, link.route[index]!, to) < LINK_CLEARANCE,
        ),
    ) &&
    !trees.some(
      (tree) => Math.hypot(tree.x - point.x, tree.y - point.y) < TREE_SPACING,
    );

  const tryPlace = (point: TilePoint) => {
    if (isFree(point))
      trees.push({ ...point, size: Math.floor(rng.range(0, 3)) });
  };

  // Accent trees on the grass corners and along the sides of every plot.
  for (const node of allBuildings) {
    const grass = expandRect(nodeRect(node), GRASS_MARGIN + 0.08);
    for (const corner of [
      { x: grass.x0, y: grass.y0 },
      { x: grass.x1, y: grass.y0 },
      { x: grass.x0, y: grass.y1 },
      { x: grass.x1, y: grass.y1 },
      { x: (grass.x0 + grass.x1) / 2, y: grass.y1 },
      { x: grass.x1, y: (grass.y0 + grass.y1) / 2 },
    ]) {
      if (rng.chance(0.6)) tryPlace(corner);
    }
  }

  // A light scatter for density, on a jittered grid.
  for (let x = area.x0 + 0.4; x < area.x1; x += 0.9) {
    for (let y = area.y0 + 0.4; y < area.y1; y += 0.9) {
      if (rng.chance(0.06))
        tryPlace({
          x: x + rng.range(-0.25, 0.25),
          y: y + rng.range(-0.25, 0.25),
        });
    }
  }

  return { fillers, trees };
}

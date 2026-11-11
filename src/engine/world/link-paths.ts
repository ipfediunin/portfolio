import type { LinkSpec, WorldGraph } from "@/simulation/model/graph";

import { tileToWorld, type Point2 } from "../iso/projection";
import { PolylinePath } from "./polyline-path";

/** Lines float slightly above the road so they read as light, not paint. */
export const LINE_ELEVATION = 2;
const ARC_SEGMENTS = 32;

/** World-space points of a link, from its source to its target. Arcs become a sampled curve. */
export function linkWorldPoints(link: LinkSpec): Point2[] {
  const points = link.route.map((tile) => {
    const world = tileToWorld(tile.x, tile.y);
    return { x: world.x, y: world.y - LINE_ELEVATION };
  });
  if (link.shape !== "arc") return points;

  const [start, end] = points;
  if (!start || !end) return points;
  // Quadratic curve lifted above the city; longer arcs rise higher.
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  const lift = Math.min(Math.max(chord * 0.32, 90), 300);
  const control = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - lift };
  return Array.from({ length: ARC_SEGMENTS + 1 }, (_, index) => {
    const t = index / ARC_SEGMENTS;
    const inverse = 1 - t;
    return {
      x:
        inverse * inverse * start.x +
        2 * inverse * t * control.x +
        t * t * end.x,
      y:
        inverse * inverse * start.y +
        2 * inverse * t * control.y +
        t * t * end.y,
    };
  });
}

export interface LinkPath {
  readonly link: LinkSpec;
  readonly forward: PolylinePath;
  readonly backward: PolylinePath;
}

/** Precomputed paths for every link, both directions, shared by everything that travels along links. */
export function createLinkPaths(
  graph: WorldGraph,
): ReadonlyMap<string, LinkPath> {
  return new Map(
    graph.links.map((link) => {
      const points = linkWorldPoints(link);
      return [
        link.id,
        {
          link,
          forward: new PolylinePath(points),
          backward: new PolylinePath([...points].reverse()),
        },
      ] as const;
    }),
  );
}

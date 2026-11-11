import { nodeCenter, nodeRect, type NodeSpec } from "@/simulation/model/graph";

import { depthKey, tileToWorld, type Point2 } from "../iso/projection";

/** Footprint grown by this many tiles, so small buildings are easy to hit with a finger. */
const HIT_MARGIN_TILES = 0.12;
/** Roof accessories (antennas, globes) rise a little above the body. */
const HIT_ROOF_PADDING = 10;

export interface NodeHitArea {
  readonly nodeId: string;
  readonly depth: number;
  /** Screen-facing silhouette of the building in world space: a convex hexagon, clockwise. */
  readonly polygon: readonly Point2[];
}

/**
 * Silhouette of an isometric box: the ground diamond extruded upward. Its outline is the hexagon
 * top-left, top, top-right raised corners and the right, bottom, left ground corners.
 */
export function buildingSilhouette(
  node: NodeSpec,
  baseHeight: number,
): Point2[] {
  const rect = nodeRect(node);
  const x0 = rect.x0 - HIT_MARGIN_TILES;
  const y0 = rect.y0 - HIT_MARGIN_TILES;
  const x1 = rect.x1 + HIT_MARGIN_TILES;
  const y1 = rect.y1 + HIT_MARGIN_TILES;
  const lift = baseHeight + node.height + HIT_ROOF_PADDING;
  const back = tileToWorld(x0, y0);
  const right = tileToWorld(x1, y0);
  const front = tileToWorld(x1, y1);
  const left = tileToWorld(x0, y1);
  return [
    { x: back.x, y: back.y - lift },
    { x: right.x, y: right.y - lift },
    { x: right.x, y: right.y },
    { x: front.x, y: front.y },
    { x: left.x, y: left.y },
    { x: left.x, y: left.y - lift },
  ];
}

/** Hit areas for the system's buildings, front-most first (the order picking checks them in). */
export function createNodeHitAreas(
  nodes: readonly NodeSpec[],
  baseHeight: number,
): NodeHitArea[] {
  return nodes
    .map((node) => {
      const center = nodeCenter(node);
      return {
        nodeId: node.id,
        depth: depthKey(center.x, center.y),
        polygon: buildingSilhouette(node, baseHeight),
      };
    })
    .sort((a, b) => b.depth - a.depth);
}

/** Point-in-convex-polygon for a clockwise outline (y down): the point is right of every edge. */
function containsPoint(polygon: readonly Point2[], x: number, y: number) {
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross < 0) return false;
  }
  return true;
}

/** The front-most building under a world-space point, or null. */
export function pickNode(
  areas: readonly NodeHitArea[],
  worldX: number,
  worldY: number,
): string | null {
  for (const area of areas) {
    if (containsPoint(area.polygon, worldX, worldY)) return area.nodeId;
  }
  return null;
}

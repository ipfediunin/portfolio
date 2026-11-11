import { describe, expect, it } from "vitest";

import type { NodeSpec } from "@/simulation/model/graph";

import { tileToWorld } from "../iso/projection";
import { createNodeHitAreas, pickNode } from "./node-picking";

function node(id: string, x: number, y: number, height: number): NodeSpec {
  return {
    id,
    kind: "service",
    label: id,
    tech: "FastAPI",
    tile: { x, y },
    footprint: { width: 2, depth: 2 },
    height,
  };
}

describe("node picking", () => {
  const back = node("back", 0, 0, 160);
  const front = node("front", 2.6, 2.6, 40);
  const areas = createNodeHitAreas([back, front], 4);

  it("hits a building on its roof and on its walls", () => {
    const center = tileToWorld(1, 1);
    expect(pickNode(areas, center.x, center.y - 4 - 160)).toBe("back");
    // Lower part of the left wall, just above the ground.
    const leftWall = tileToWorld(0.2, 1.9);
    expect(pickNode(areas, leftWall.x, leftWall.y - 20)).toBe("back");
  });

  it("misses empty ground and the sky beside a roof", () => {
    const ground = tileToWorld(-3, 6);
    expect(pickNode(areas, ground.x, ground.y)).toBeNull();
    const corner = tileToWorld(2, 0);
    expect(pickNode(areas, corner.x + 60, corner.y - 200)).toBeNull();
  });

  it("prefers the building in front where silhouettes overlap", () => {
    // Just above the tall building's front ground corner, where the low building's roof covers it.
    const point = { x: 0, y: 125 };
    for (const area of areas)
      expect(pickNode([area], point.x, point.y)).toBe(area.nodeId);
    expect(pickNode(areas, point.x, point.y)).toBe("front");
  });
});

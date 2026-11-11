import { describe, expect, it } from "vitest";

import { cityGraph } from "@/simulation/graphs/city";
import {
  expandRect,
  nodeRect,
  rectsOverlap,
  roadRect,
  type TileRect,
} from "@/simulation/model/graph";

import { planDecor } from "./decor-layout";

const inside = (point: { x: number; y: number }, rect: TileRect) =>
  point.x > rect.x0 &&
  point.x < rect.x1 &&
  point.y > rect.y0 &&
  point.y < rect.y1;

describe("planDecor", () => {
  const { fillers, trees } = planDecor(cityGraph);

  it("is deterministic", () => {
    expect(planDecor(cityGraph)).toEqual({ fillers, trees });
  });

  it("keeps background buildings out of the system core, off roads and away from nodes", () => {
    expect(fillers.length).toBeGreaterThan(10);
    for (const filler of fillers) {
      const rect = nodeRect(filler);
      expect(rectsOverlap(rect, cityGraph.views.system.area)).toBe(false);
      for (const road of cityGraph.roads)
        expect(rectsOverlap(rect, roadRect(road))).toBe(false);
      for (const node of cityGraph.nodes)
        expect(rectsOverlap(rect, expandRect(nodeRect(node), 0.5))).toBe(false);
    }
  });

  it("keeps background footprints compact enough for depth sorting", () => {
    for (const filler of fillers) {
      expect(
        Math.abs(filler.footprint.width - filler.footprint.depth),
      ).toBeLessThanOrEqual(0.8);
    }
  });

  it("places a meaningful amount of greenery", () => {
    expect(trees.length).toBeGreaterThan(30);
  });

  it("keeps trees off buildings and roads", () => {
    for (const tree of trees) {
      for (const node of [...cityGraph.nodes, ...fillers])
        expect(inside(tree, nodeRect(node))).toBe(false);
      for (const road of cityGraph.roads)
        expect(inside(tree, roadRect(road))).toBe(false);
    }
  });

  it("keeps trees apart from each other", () => {
    for (const [index, tree] of trees.entries()) {
      for (const other of trees.slice(index + 1)) {
        expect(
          Math.hypot(tree.x - other.x, tree.y - other.y),
        ).toBeGreaterThanOrEqual(0.42);
      }
    }
  });
});

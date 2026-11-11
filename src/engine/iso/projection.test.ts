import { describe, expect, it } from "vitest";

import { prismFaces } from "./prism-geometry";
import {
  depthKey,
  TILE_HEIGHT,
  TILE_WIDTH,
  tileToWorld,
  worldToTile,
} from "./projection";

describe("tileToWorld", () => {
  it("places the grid origin at the world origin", () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("maps tile axes to the 2:1 diamond", () => {
    expect(tileToWorld(1, 0)).toEqual({
      x: TILE_WIDTH / 2,
      y: TILE_HEIGHT / 2,
    });
    expect(tileToWorld(0, 1)).toEqual({
      x: -TILE_WIDTH / 2,
      y: TILE_HEIGHT / 2,
    });
    expect(tileToWorld(1, 1)).toEqual({ x: 0, y: TILE_HEIGHT });
  });

  it("writes into the provided output object", () => {
    const out = { x: 0, y: 0 };
    expect(tileToWorld(2, 3, out)).toBe(out);
  });
});

describe("worldToTile", () => {
  it("inverts tileToWorld", () => {
    for (const [x, y] of [
      [0, 0],
      [3.5, 1.25],
      [-2, 7],
      [9.75, 9.75],
    ] as const) {
      const world = tileToWorld(x, y);
      const tile = worldToTile(world.x, world.y);
      expect(tile.x).toBeCloseTo(x, 10);
      expect(tile.y).toBeCloseTo(y, 10);
    }
  });
});

describe("depthKey", () => {
  it("draws tiles closer to the viewer later", () => {
    expect(depthKey(5, 5)).toBeGreaterThan(depthKey(4, 5));
    expect(depthKey(2, 8)).toBe(depthKey(8, 2));
  });
});

describe("prismFaces", () => {
  it("raises the top face by the prism height", () => {
    const faces = prismFaces({
      tileX: 1,
      tileY: 1,
      width: 1,
      depth: 1,
      height: 40,
    });
    const backCorner = tileToWorld(1, 1);
    expect(faces.top.slice(0, 2)).toEqual([backCorner.x, backCorner.y - 40]);
    expect(faces.top).toHaveLength(8);
    expect(faces.left).toHaveLength(8);
    expect(faces.right).toHaveLength(8);
  });
});

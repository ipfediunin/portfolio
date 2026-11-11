import { describe, expect, it } from "vitest";

import { PolylinePath, type PathSample } from "../world/polyline-path";
import { tileAreaBounds } from "./bounds";
import { faceFrame, faceQuad, groundQuad, prismFaces } from "./prism-geometry";
import { tileToWorld } from "./projection";

describe("prism geometry", () => {
  const footprint = {
    tileX: 2,
    tileY: 3,
    width: 1,
    depth: 1,
    height: 40,
    elevation: 6,
  };

  it("lifts every face by the elevation", () => {
    const faces = prismFaces(footprint);
    const leftCorner = tileToWorld(2, 4);
    expect(faces.left.slice(0, 2)).toEqual([leftCorner.x, leftCorner.y - 6]);
    expect(faces.top[1]).toBe(tileToWorld(2, 3).y - 46);
  });

  it("maps face fractions onto the face plane", () => {
    const frame = faceFrame(footprint, "left");
    const quad = faceQuad(frame, 0, 1, 0, footprint.height);
    expect(quad).toEqual(prismFaces(footprint).left);
  });

  it("raises ground quads by elevation", () => {
    expect(groundQuad(0, 0, 1, 1, 4)[1]).toBe(-4);
  });
});

describe("tileAreaBounds", () => {
  it("covers the projected diamond and the overhang", () => {
    const bounds = tileAreaBounds({ x0: 0, y0: 0, x1: 2, y1: 2 }, 50);
    expect(bounds).toEqual({ x: -128, y: -50, width: 256, height: 178 });
  });
});

describe("PolylinePath.sampleAt", () => {
  it("returns the travel direction of the current segment", () => {
    const path = new PolylinePath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: -10 },
    ]);
    const sample: PathSample = { x: 0, y: 0, directionX: 0, directionY: 0 };
    path.sampleAt(4, sample);
    expect(sample).toMatchObject({ x: 4, y: 0, directionX: 1, directionY: 0 });
    path.sampleAt(15, sample);
    expect(sample).toMatchObject({
      x: 10,
      y: -5,
      directionX: 0,
      directionY: -1,
    });
  });
});

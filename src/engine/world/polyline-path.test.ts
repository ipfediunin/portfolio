import { describe, expect, it } from "vitest";

import { PolylinePath } from "./polyline-path";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("PolylinePath", () => {
  it("measures open and closed paths", () => {
    expect(new PolylinePath(square).length).toBe(30);
    expect(new PolylinePath(square, { closed: true }).length).toBe(40);
  });

  it("interpolates inside segments", () => {
    const path = new PolylinePath(square);
    expect(path.pointAt(5)).toEqual({ x: 5, y: 0 });
    expect(path.pointAt(15)).toEqual({ x: 10, y: 5 });
  });

  it("returns exact vertices at segment boundaries", () => {
    const path = new PolylinePath(square);
    expect(path.pointAt(10)).toEqual({ x: 10, y: 0 });
    expect(path.pointAt(20)).toEqual({ x: 10, y: 10 });
  });

  it("clamps open paths", () => {
    const path = new PolylinePath(square);
    expect(path.pointAt(-5)).toEqual({ x: 0, y: 0 });
    expect(path.pointAt(100)).toEqual({ x: 0, y: 10 });
  });

  it("wraps closed paths in both directions", () => {
    const loop = new PolylinePath(square, { closed: true });
    expect(loop.pointAt(45)).toEqual({ x: 5, y: 0 });
    expect(loop.pointAt(-5)).toEqual({ x: 0, y: 5 });
  });

  it("reuses the output object", () => {
    const out = { x: 0, y: 0 };
    expect(new PolylinePath(square).pointAt(3, out)).toBe(out);
  });

  it("rejects degenerate input", () => {
    expect(() => new PolylinePath([{ x: 0, y: 0 }])).toThrow();
  });
});

import { describe, expect, it } from "vitest";

import { easeInOutCubic, interpolateFraming } from "./flight";

const pivot = { x: 400, y: 300 };
const from = { scale: 0.5, offsetX: 100, offsetY: 50 };
const to = { scale: 2, offsetX: -900, offsetY: -400 };

describe("camera flight", () => {
  it("starts and ends exactly at the given framings", () => {
    expect(interpolateFraming(from, to, 0, pivot)).toEqual(from);
    const end = interpolateFraming(from, to, 1, pivot);
    expect(end.scale).toBeCloseTo(to.scale);
    expect(end.offsetX).toBeCloseTo(to.offsetX);
    expect(end.offsetY).toBeCloseTo(to.offsetY);
  });

  it("zooms geometrically: halfway between 0.5× and 2× is 1×", () => {
    expect(interpolateFraming(from, to, 0.5, pivot).scale).toBeCloseTo(1);
  });

  it("moves the world point under the pivot in a straight line", () => {
    const worldAt = (t: number) => {
      const framing = interpolateFraming(from, to, t, pivot);
      return {
        x: (pivot.x - framing.offsetX) / framing.scale,
        y: (pivot.y - framing.offsetY) / framing.scale,
      };
    };
    const start = worldAt(0);
    const middle = worldAt(0.5);
    const end = worldAt(1);
    expect(middle.x).toBeCloseTo((start.x + end.x) / 2);
    expect(middle.y).toBeCloseTo((start.y + end.y) / 2);
  });

  it("eases in and out symmetrically", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75));
  });
});

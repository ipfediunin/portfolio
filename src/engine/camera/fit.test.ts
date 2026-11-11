import { describe, expect, it } from "vitest";

import { fitContain } from "./fit";

const content = { x: -100, y: -50, width: 200, height: 100 };

/** Screen position of a world point under a framing. */
const project = (
  framing: ReturnType<typeof fitContain>,
  x: number,
  y: number,
) => ({
  x: x * framing.scale + framing.offsetX,
  y: y * framing.scale + framing.offsetY,
});

describe("fitContain", () => {
  it("scales to the limiting axis and centers the content", () => {
    const framing = fitContain(content, { width: 400, height: 400 });
    expect(framing.scale).toBe(2);
    expect(project(framing, -100, -50)).toEqual({ x: 0, y: 100 });
    expect(project(framing, 100, 50)).toEqual({ x: 400, y: 300 });
  });

  it("respects padding", () => {
    const framing = fitContain(
      content,
      { width: 220, height: 400 },
      { padding: 10 },
    );
    expect(framing.scale).toBe(1);
    expect(project(framing, -100, 0).x).toBe(10);
  });

  it("caps the zoom", () => {
    expect(
      fitContain(content, { width: 2000, height: 1000 }, { maxScale: 1.5 })
        .scale,
    ).toBe(1.5);
  });

  it("stays finite for a collapsed viewport", () => {
    const framing = fitContain(
      content,
      { width: 0, height: 0 },
      { padding: 20 },
    );
    expect(Number.isFinite(framing.scale)).toBe(true);
    expect(framing.scale).toBeGreaterThan(0);
  });

  it("centers the content in the region right of the inset", () => {
    const framing = fitContain(
      content,
      { width: 600, height: 400 },
      { insets: { top: 0, right: 0, bottom: 0, left: 200 } },
    );
    expect(framing.scale).toBe(2);
    expect(project(framing, -100, 0).x).toBe(200);
    expect(project(framing, 100, 0).x).toBe(600);
  });

  it("frames the content between insets on every side", () => {
    const framing = fitContain(
      content,
      { width: 1000, height: 600 },
      { insets: { top: 100, right: 200, bottom: 100, left: 400 } },
    );
    // A 400×400 region: the 200×100 content fits its width at scale 2.
    expect(framing.scale).toBe(2);
    expect(project(framing, -100, -50)).toEqual({ x: 400, y: 200 });
    expect(project(framing, 100, 50)).toEqual({ x: 800, y: 400 });
  });
});

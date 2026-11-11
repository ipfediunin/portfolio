import { describe, expect, it } from "vitest";

import {
  parseFocusInset,
  resolveFocusInsets,
  type FocusInsetSide,
} from "./focus-inset";

describe("parseFocusInset", () => {
  it("reads a share of the axis", () => {
    expect(parseFocusInset("0.3", 1000)).toBe(300);
  });

  it("reads a fixed size in pixels", () => {
    expect(parseFocusInset("480px", 1440)).toBe(480);
  });

  it("always leaves the scene part of the viewport", () => {
    expect(parseFocusInset("0.9", 1000)).toBe(600);
    expect(parseFocusInset("900px", 1000)).toBe(600);
  });

  it("treats a missing or malformed value as no inset", () => {
    for (const value of [null, "", "abc", "-0.2", "0", "12em", "px"])
      expect(parseFocusInset(value, 1000), String(value)).toBe(0);
  });
});

describe("resolveFocusInsets", () => {
  const read =
    (values: Partial<Record<FocusInsetSide, string>>) =>
    (side: FocusInsetSide) =>
      values[side] ?? null;

  it("reads every side against its own axis", () => {
    expect(
      resolveFocusInsets(read({ left: "480px", top: "0.1", bottom: "120px" }), {
        width: 1440,
        height: 1000,
      }),
    ).toEqual({ top: 100, right: 0, bottom: 120, left: 480 });
  });

  it("shrinks opposite sides together so the scene keeps a third of the axis", () => {
    const insets = resolveFocusInsets(read({ left: "500px", right: "400px" }), {
      width: 1000,
      height: 800,
    });
    expect(insets.left + insets.right).toBeCloseTo(650);
    expect(insets.left / insets.right).toBeCloseTo(500 / 400);
  });
});

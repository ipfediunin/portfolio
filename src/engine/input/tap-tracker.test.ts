import { describe, expect, it } from "vitest";

import { TAP_MAX_MS, TAP_SLOP_PX, TapTracker } from "./tap-tracker";

describe("TapTracker", () => {
  it("accepts a short press that stays in place", () => {
    const tracker = new TapTracker();
    tracker.pointerDown(1, 100, 100, 0);
    tracker.pointerMove(1, 103, 98);
    expect(tracker.pointerUp(1, 104, 99, 120)).toBe(true);
  });

  it("rejects a press that turned into a scroll, even if it comes back", () => {
    const tracker = new TapTracker();
    tracker.pointerDown(1, 100, 100, 0);
    tracker.pointerMove(1, 100, 100 + TAP_SLOP_PX + 5);
    tracker.pointerMove(1, 100, 101);
    expect(tracker.pointerUp(1, 100, 101, 200)).toBe(false);
  });

  it("rejects long presses and cancelled gestures", () => {
    const tracker = new TapTracker();
    tracker.pointerDown(1, 50, 50, 0);
    expect(tracker.pointerUp(1, 50, 50, TAP_MAX_MS + 1)).toBe(false);

    tracker.pointerDown(2, 50, 50, 1000);
    tracker.pointerCancel(2);
    expect(tracker.pointerUp(2, 50, 50, 1050)).toBe(false);
  });

  it("ignores pinches until every finger has lifted", () => {
    const tracker = new TapTracker();
    tracker.pointerDown(1, 10, 10, 0);
    tracker.pointerDown(2, 80, 80, 20);
    expect(tracker.pointerUp(2, 80, 80, 90)).toBe(false);
    expect(tracker.pointerUp(1, 10, 10, 100)).toBe(false);

    tracker.pointerDown(3, 10, 10, 500);
    expect(tracker.pointerUp(3, 10, 10, 560)).toBe(true);
  });
});

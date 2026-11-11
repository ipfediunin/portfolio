import { describe, expect, it } from "vitest";

import { FrameMonitor } from "./frame-monitor";
import {
  detectQualityTier,
  downgradeTier,
  frameBudgetMs,
  qualityTiers,
  resolveResolution,
  type DeviceProfile,
} from "./quality";

const desktop: DeviceProfile = {
  devicePixelRatio: 2,
  hardwareConcurrency: 12,
  deviceMemoryGb: 8,
  coarsePointer: false,
  saveData: false,
};

describe("detectQualityTier", () => {
  it("gives capable desktops the high tier", () => {
    expect(detectQualityTier(desktop)).toBe("high");
  });

  it("starts touch devices and mid-range hardware on medium", () => {
    expect(detectQualityTier({ ...desktop, coarsePointer: true })).toBe(
      "medium",
    );
    expect(detectQualityTier({ ...desktop, hardwareConcurrency: 4 })).toBe(
      "medium",
    );
  });

  it("respects Save-Data and weak hardware", () => {
    expect(detectQualityTier({ ...desktop, saveData: true })).toBe("low");
    expect(detectQualityTier({ ...desktop, deviceMemoryGb: 2 })).toBe("low");
  });

  it("assumes a mid-range device when hints are missing", () => {
    expect(
      detectQualityTier({
        ...desktop,
        hardwareConcurrency: undefined,
        deviceMemoryGb: undefined,
      }),
    ).toBe("medium");
  });
});

describe("tier helpers", () => {
  it("downgrades one step at a time and stops at low", () => {
    expect(downgradeTier("high")).toBe("medium");
    expect(downgradeTier("medium")).toBe("low");
    expect(downgradeTier("low")).toBe("low");
  });

  it("caps the resolution per tier but never goes below 1", () => {
    expect(resolveResolution(qualityTiers.high, 3)).toBe(2);
    expect(resolveResolution(qualityTiers.medium, 3)).toBe(1.5);
    expect(resolveResolution(qualityTiers.high, 0.5)).toBe(1);
  });

  it("budgets frames with headroom over the target rate", () => {
    expect(frameBudgetMs(qualityTiers.high)).toBeCloseTo(21.67, 1);
    expect(frameBudgetMs(qualityTiers.low)).toBeCloseTo(43.33, 1);
  });
});

describe("FrameMonitor", () => {
  const feed = (monitor: FrameMonitor, deltaMs: number, durationMs: number) => {
    let recommended = false;
    for (let elapsed = 0; elapsed < durationMs; elapsed += deltaMs) {
      recommended = monitor.sample(deltaMs) || recommended;
    }
    return recommended;
  };

  it("never recommends a downgrade for frames within budget", () => {
    expect(feed(new FrameMonitor({ budgetMs: 20 }), 16.7, 10_000)).toBe(false);
  });

  it("ignores slow frames during warm-up", () => {
    expect(
      feed(new FrameMonitor({ budgetMs: 20, warmupMs: 2000 }), 40, 1900),
    ).toBe(false);
  });

  it("recommends a downgrade after sustained slow frames", () => {
    expect(
      feed(
        new FrameMonitor({ budgetMs: 20, warmupMs: 1000, sustainMs: 2000 }),
        40,
        3200,
      ),
    ).toBe(true);
  });

  it("forgives a short spike", () => {
    const monitor = new FrameMonitor({
      budgetMs: 20,
      warmupMs: 1000,
      sustainMs: 2000,
    });
    feed(monitor, 16.7, 2000);
    feed(monitor, 60, 300);
    expect(feed(monitor, 16.7, 5000)).toBe(false);
  });
});

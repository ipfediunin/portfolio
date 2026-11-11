import { describe, expect, it } from "vitest";

import type { ImpactMeasure } from "@/simulation/cases/impact";

import {
  barShare,
  formatNumber,
  impactFigure,
  impactValue,
} from "./impact-format";

const text = (value: number, unit: ImpactMeasure["unit"]) =>
  formatNumber(impactValue(value, unit, "time units"));

const measure = (
  unit: ImpactMeasure["unit"],
  better: ImpactMeasure["better"],
  values: readonly number[],
): ImpactMeasure => ({
  id: "test",
  unit,
  better,
  bars: values.map((value, index) => ({ id: `bar-${index}`, value })),
});

describe("impact values", () => {
  it("prints milliseconds and seconds", () => {
    expect(text(1060.3, "ms")).toBe("1.1 s");
    expect(text(640.4, "ms")).toBe("640 ms");
    expect(text(11.85, "ms")).toBe("12 ms");
    expect(text(2.8, "ms")).toBe("2.8 ms");
  });

  it("prints shares, model time and errors", () => {
    expect(text(33.333, "percent")).toBe("33%");
    expect(text(36, "units")).toBe("36 time units");
    expect(text(1.9152, "error")).toBe("1.9");
    expect(text(0.3075, "error")).toBe("0.31");
    expect(text(0.0254, "error")).toBe("0.025");
    expect(text(0, "error")).toBe("0");
  });
});

describe("impact figures", () => {
  it("shows how many times better", () => {
    const fast = measure("ms", "lower", [1060.3, 11.85]);
    expect(formatNumber(impactFigure(fast, "ratio", ""))).toBe("89×");
    const batch = measure("units", "lower", [36, 18, 13]);
    expect(formatNumber(impactFigure(batch, "ratio", ""))).toBe("2.8×");
  });

  it("shows a reduction and the result itself", () => {
    const reads = measure("percent", "lower", [100, 30]);
    expect(formatNumber(impactFigure(reads, "reduction", ""))).toBe("−70%");
    const delivered = measure("percent", "higher", [26.7, 100]);
    expect(formatNumber(impactFigure(delivered, "after", ""))).toBe("100%");
  });
});

describe("bar share", () => {
  it("scales to the longest bar and draws nothing at zero", () => {
    const bars = measure("percent", "higher", [25, 100, 0]).bars;
    expect(barShare(25, bars)).toBe(25);
    expect(barShare(100, bars)).toBe(100);
    expect(barShare(0, bars)).toBe(0);
  });
});

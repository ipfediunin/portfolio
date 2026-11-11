import { describe, expect, it } from "vitest";

import { compilePipeline } from "./compile";
import {
  cleanSamples,
  datasets,
  errorAgainstTruth,
  interpolate,
  interpolationMethods,
  leaveOneOutError,
  sampleDataset,
  type Point,
} from "./model";

/** Synthetic datasets have no gaps; the filter only narrows the type. */
const points = (id: "sine" | "runge" | "steps", count: number): Point[] =>
  sampleDataset(id, count).filter((point): point is Point => point.y !== null);

describe("interpolation", () => {
  it("passes through every data point, whatever the method", () => {
    const data = points("sine", 9);
    for (const method of interpolationMethods) {
      const curve = interpolate(method, data);
      for (const point of data) expect(curve(point.x)).toBeCloseTo(point.y, 9);
    }
  });

  it("reproduces a straight line exactly", () => {
    const line = [0, 1, 2.5, 4].map((x) => ({ x, y: 2 * x + 1 }));
    for (const method of interpolationMethods)
      expect(interpolate(method, line)(1.7)).toBeCloseTo(4.4, 9);
  });

  it("is more accurate with a spline than with straight segments on smooth data", () => {
    const data = points("sine", 9);
    const truth = datasets.sine.truth;
    expect(errorAgainstTruth("spline", data, truth).max).toBeLessThan(
      errorAgainstTruth("linear", data, truth).max,
    );
  });

  it("shows Runge's phenomenon: the polynomial swings near the ends", () => {
    const data = points("runge", 13);
    const truth = datasets.runge.truth;
    const polynomial = errorAgainstTruth("lagrange", data, truth).max;
    expect(polynomial).toBeGreaterThan(1);
    expect(errorAgainstTruth("spline", data, truth).max).toBeLessThan(0.1);
  });

  it("keeps a monotone step monotone with PCHIP", () => {
    const data = points("steps", 9);
    const curve = interpolate("pchip", data);
    const xs = Array.from({ length: 200 }, (_, index) => index / 199);
    const values = xs.map(curve);
    for (let index = 1; index < values.length; index++)
      expect(values[index]!).toBeGreaterThanOrEqual(values[index - 1]! - 1e-12);
    const max = Math.max(...data.map((point) => point.y));
    expect(Math.max(...values)).toBeLessThanOrEqual(max + 1e-12);
  });

  it("rates edited data without ground truth (leave-one-out)", () => {
    const data = points("sine", 9);
    const loo = leaveOneOutError("spline", data);
    expect(loo?.rmse).toBeGreaterThan(0);
    expect(leaveOneOutError("spline", data.slice(0, 3))).toBeNull();
  });
});

describe("cleaning", () => {
  it("drops the two missing readings and the spike, nothing else", () => {
    const raw = sampleDataset("sensor", 7);
    expect(raw).toHaveLength(21);
    const spike = raw[10]!;
    const report = cleanSamples(raw);
    expect(report.missing).toBe(2);
    expect(report.outliers).toBe(1);
    expect(report.points).toHaveLength(18);
    expect(report.points.some((point) => point.x === spike.x)).toBe(false);
  });

  it("leaves readings within the noise alone", () => {
    const calm = sampleDataset("sensor", 7).map((point, index) =>
      index === 10 ? { ...point, y: Math.sin(point.x) } : point,
    );
    expect(cleanSamples(calm).outliers).toBe(0);
  });
});

describe("pipeline run", () => {
  it("compiles with and without ground truth", () => {
    const base = {
      rows: 13,
      missing: 2,
      outliers: 1,
      points: 10,
      method: "spline",
      looError: 0.02,
    } as const;
    const run = compilePipeline(
      { ...base, maxError: 0.01 },
      { startAt: 0, sequence: 1 },
    );
    expect(run.captions.at(-1)?.key).toBe("done");
    const edited = compilePipeline(
      { ...base, maxError: null },
      { startAt: 0, sequence: 2 },
    );
    expect(edited.captions.at(-1)?.key).toBe("doneEdited");
  });
});

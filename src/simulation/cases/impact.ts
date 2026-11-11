/**
 * What a case's engineering idea changes, measured by the case's own model: the same work done
 * without the idea and with it (no cache vs a cache, one worker vs three, raw data vs cleaned).
 * The numbers come from the model and its synthetic data, never from a real system; the page says
 * so next to every chart.
 */

export const impactUnits = ["ms", "percent", "units", "error"] as const;
export type ImpactUnit = (typeof impactUnits)[number];

export interface ImpactBar {
  /** Stable id the content labels it by, e.g. "cache". */
  readonly id: string;
  readonly value: number;
}

export interface ImpactMeasure {
  readonly id: string;
  readonly unit: ImpactUnit;
  /** Which direction is an improvement. */
  readonly better: "lower" | "higher";
  /** The approach without the idea first, the one the case uses last. */
  readonly bars: readonly ImpactBar[];
}

export interface ImpactComparison {
  readonly baseline: number;
  readonly result: number;
  /** How many times better the result is; null when the baseline or the result is zero. */
  readonly ratio: number | null;
  /** Share by which a lower-is-better value went down (0.8 = 80% less); null for higher-is-better. */
  readonly reduction: number | null;
}

/** Compares the first bar (without the idea) with the last one (with it). */
export function compareImpact(measure: ImpactMeasure): ImpactComparison {
  const baseline = measure.bars[0]?.value;
  const result = measure.bars.at(-1)?.value;
  if (baseline === undefined || result === undefined || measure.bars.length < 2)
    throw new Error(`Impact "${measure.id}" needs at least two bars`);
  const lower = measure.better === "lower";
  const [worse, improved] = lower ? [baseline, result] : [result, baseline];
  return {
    baseline,
    result,
    ratio: worse > 0 && improved > 0 ? worse / improved : null,
    reduction: lower && baseline > 0 ? (baseline - result) / baseline : null,
  };
}

/** True when the last bar is an improvement over the first: a chart that says otherwise is a bug. */
export function improves(measure: ImpactMeasure): boolean {
  const { baseline, result } = compareImpact(measure);
  return measure.better === "lower" ? result < baseline : result > baseline;
}

/** Mean of a list of numbers (a model run averaged over questions, seeds or attempts). */
export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot average an empty list");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

import type { GlanceFigure } from "@/content/schema";
import {
  compareImpact,
  type ImpactMeasure,
  type ImpactUnit,
} from "@/simulation/cases/impact";

/** A number as a chart prints it, kept apart from its text so a counter can animate the digits. */
export interface FormattedNumber {
  readonly value: number;
  readonly decimals: number;
  readonly prefix: string;
  readonly suffix: string;
}

const formatters = new Map<number, Intl.NumberFormat>();

export function formatNumber({
  value,
  decimals,
  prefix,
  suffix,
}: FormattedNumber): string {
  let formatter = formatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, formatter);
  }
  return `${prefix}${formatter.format(value)}${suffix}`;
}

/** Digits after the point for two significant digits: 1.9, 0.31, 0.025. */
const twoSignificant = (value: number) =>
  value <= 0 ? 0 : Math.max(0, 1 - Math.floor(Math.log10(value)));

/** A bar's value with its unit: "1.1 s", "12 ms", "33%", "36 time units", "0.025". */
export function impactValue(
  value: number,
  unit: ImpactUnit,
  timeUnits: string,
): FormattedNumber {
  switch (unit) {
    case "ms":
      return value >= 1000
        ? { value: value / 1000, decimals: 1, prefix: "", suffix: " s" }
        : { value, decimals: value < 10 ? 1 : 0, prefix: "", suffix: " ms" };
    case "percent":
      return { value, decimals: 0, prefix: "", suffix: "%" };
    case "units":
      return { value, decimals: 0, prefix: "", suffix: ` ${timeUnits}` };
    case "error":
      return { value, decimals: twoSignificant(value), prefix: "", suffix: "" };
  }
}

/** The big number of a chart: "89×", "−70%", or the result itself ("100%"). */
export function impactFigure(
  measure: ImpactMeasure,
  figure: GlanceFigure,
  timeUnits: string,
): FormattedNumber {
  const comparison = compareImpact(measure);
  switch (figure) {
    case "ratio": {
      // The content schema rejects a ratio chart whose bars make it undefined.
      const ratio = comparison.ratio ?? 1;
      return {
        value: ratio,
        decimals: ratio >= 10 ? 0 : 1,
        prefix: "",
        suffix: "×",
      };
    }
    case "reduction":
      return {
        value: Math.round((comparison.reduction ?? 0) * 100),
        decimals: 0,
        prefix: "−",
        suffix: "%",
      };
    case "after":
      return impactValue(comparison.result, measure.unit, timeUnits);
  }
}

/** Bar length as a share of the longest bar, in percent. */
export function barShare(value: number, bars: ImpactMeasure["bars"]): number {
  const longest = Math.max(...bars.map((bar) => bar.value));
  return longest > 0 && value > 0 ? (value / longest) * 100 : 0;
}

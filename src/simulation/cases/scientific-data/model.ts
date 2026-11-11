import { SeededRng } from "../../runtime/seeded-rng";

/**
 * Numerical core of the scientific-data demo, written out the way NumPy and SciPy compute it:
 * linear interpolation (np.interp), a natural cubic spline (CubicSpline, bc_type="natural"), a
 * monotone cubic (PchipInterpolator) and the interpolating polynomial (BarycentricInterpolator).
 * Datasets are synthetic functions, so every interpolant can be compared with the truth.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A raw sample: a sensor can miss a value. */
export interface RawPoint {
  readonly x: number;
  readonly y: number | null;
}

export const interpolationMethods = [
  "linear",
  "spline",
  "pchip",
  "lagrange",
] as const;
export type InterpolationMethod = (typeof interpolationMethods)[number];

export type Interpolant = (x: number) => number;

export const datasetIds = ["sine", "runge", "steps", "sensor"] as const;
export type DatasetId = (typeof datasetIds)[number];

interface Dataset {
  readonly domain: readonly [number, number];
  readonly truth: (x: number) => number;
  /** Sensor readings come with gaps and a spike, so cleaning has something to do. */
  readonly noisy: boolean;
  /** A recording has its own sampling rate: the visitor does not choose the number of points. */
  readonly readings?: number;
}

export const datasets: Readonly<Record<DatasetId, Dataset>> = {
  sine: {
    domain: [0, 2 * Math.PI],
    truth: (x) => Math.sin(x) + 0.3 * Math.sin(3 * x),
    noisy: false,
  },
  // The classic case where a high-degree polynomial oscillates near the ends.
  runge: { domain: [-1, 1], truth: (x) => 1 / (1 + 25 * x * x), noisy: false },
  // A sharp but monotone step: smooth splines overshoot it, PCHIP does not.
  steps: {
    domain: [0, 1],
    truth: (x) => Math.tanh(12 * (x - 0.5)),
    noisy: false,
  },
  sensor: {
    domain: [0, 2 * Math.PI],
    truth: (x) => Math.sin(x),
    noisy: true,
    readings: 21,
  },
};

/**
 * Evenly spaced samples of a dataset: `count` of them, or the recording's own number of readings.
 * The sensor recording has noise, two gaps and a spike.
 */
export function sampleDataset(id: DatasetId, count: number): RawPoint[] {
  const { domain, truth, noisy, readings } = datasets[id];
  const total = readings ?? count;
  const [start, end] = domain;
  const rng = new SeededRng(total * 7919 + id.length);
  return Array.from({ length: total }, (_, index) => {
    const x = start + ((end - start) * index) / (total - 1);
    if (!noisy) return { x, y: truth(x) };
    if (index === 2 || index === total - 3) return { x, y: null };
    const spike = index === Math.floor(total / 2) ? 1.6 : 0;
    return { x, y: truth(x) + rng.range(-0.05, 0.05) + spike };
  });
}

export interface CleaningReport {
  readonly points: readonly Point[];
  readonly missing: number;
  readonly outliers: number;
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * What the Pandas step does with sensor readings: drop missing values (dropna), then drop spikes.
 * A point's residual is its distance from the straight line through its neighbours. The worst
 * point goes while its residual exceeds `threshold` robust scales (median absolute deviation) and
 * `minDeviation` in signal units; then everything is recomputed, because a spike also bends its
 * neighbours' residuals and they must stay. Smooth synthetic data needs no cleaning: a sharp
 * genuine peak would look the same as a spike.
 */
export function cleanSamples(
  samples: readonly RawPoint[],
  threshold = 4,
  minDeviation = 0.3,
): CleaningReport {
  const present = samples.filter(
    (sample): sample is Point => sample.y !== null,
  );
  const kept = [...present];
  while (kept.length >= 5) {
    const residuals = kept.slice(1, -1).map((point, index) => {
      const before = kept[index]!;
      const after = kept[index + 2]!;
      const share = (point.x - before.x) / (after.x - before.x);
      return point.y - (before.y + share * (after.y - before.y));
    });
    const centre = median(residuals);
    const scale =
      1.4826 * median(residuals.map((value) => Math.abs(value - centre)));
    let worst = 0;
    residuals.forEach((value, index) => {
      if (Math.abs(value - centre) > Math.abs(residuals[worst]! - centre))
        worst = index;
    });
    const deviation = Math.abs(residuals[worst]! - centre);
    if (deviation <= Math.max(threshold * scale, minDeviation)) break;
    kept.splice(worst + 1, 1);
  }
  return {
    points: kept,
    missing: samples.length - present.length,
    outliers: present.length - kept.length,
  };
}

function linear(points: readonly Point[]): Interpolant {
  return (x) => {
    const index = segmentIndex(points, x);
    const a = points[index]!;
    const b = points[index + 1]!;
    return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  };
}

/** Index of the segment [x_i, x_{i+1}] that holds x (clamped to the ends). */
function segmentIndex(points: readonly Point[], x: number): number {
  let low = 0;
  let high = points.length - 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (points[middle]!.x <= x) low = middle;
    else high = middle - 1;
  }
  return Math.max(0, Math.min(low, points.length - 2));
}

/** Natural cubic spline: second derivatives from a tridiagonal system (Thomas algorithm). */
function naturalSpline(points: readonly Point[]): Interpolant {
  const n = points.length;
  const h = points.slice(1).map((point, index) => point.x - points[index]!.x);
  const moments = new Array<number>(n).fill(0);
  if (n > 2) {
    const lower: number[] = [];
    const diagonal: number[] = [];
    const upper: number[] = [];
    const rhs: number[] = [];
    for (let i = 1; i < n - 1; i++) {
      lower.push(h[i - 1]!);
      diagonal.push(2 * (h[i - 1]! + h[i]!));
      upper.push(h[i]!);
      rhs.push(
        6 *
          ((points[i + 1]!.y - points[i]!.y) / h[i]! -
            (points[i]!.y - points[i - 1]!.y) / h[i - 1]!),
      );
    }
    for (let i = 1; i < diagonal.length; i++) {
      const factor = lower[i]! / diagonal[i - 1]!;
      diagonal[i] = diagonal[i]! - factor * upper[i - 1]!;
      rhs[i] = rhs[i]! - factor * rhs[i - 1]!;
    }
    for (let i = diagonal.length - 1; i >= 0; i--) {
      const next = i + 1 < diagonal.length ? moments[i + 2]! : 0;
      moments[i + 1] = (rhs[i]! - upper[i]! * next) / diagonal[i]!;
    }
  }
  return (x) => {
    const i = segmentIndex(points, x);
    const a = points[i]!;
    const b = points[i + 1]!;
    const step = h[i]!;
    const left = b.x - x;
    const right = x - a.x;
    return (
      (moments[i]! * left ** 3) / (6 * step) +
      (moments[i + 1]! * right ** 3) / (6 * step) +
      (a.y / step - (moments[i]! * step) / 6) * left +
      (b.y / step - (moments[i + 1]! * step) / 6) * right
    );
  };
}

/** Monotone piecewise cubic (Fritsch–Carlson slopes with SciPy's end conditions): no overshoot. */
function pchip(points: readonly Point[]): Interpolant {
  const n = points.length;
  const h = points.slice(1).map((point, index) => point.x - points[index]!.x);
  const delta = h.map(
    (step, index) => (points[index + 1]!.y - points[index]!.y) / step,
  );
  const slopes = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    const before = delta[k - 1]!;
    const after = delta[k]!;
    if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after))
      continue;
    const w1 = 2 * h[k]! + h[k - 1]!;
    const w2 = h[k]! + 2 * h[k - 1]!;
    slopes[k] = (w1 + w2) / (w1 / before + w2 / after);
  }
  const endSlope = (h0: number, h1: number, d0: number, d1: number) => {
    const slope = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(slope) !== Math.sign(d0)) return 0;
    if (Math.sign(d0) !== Math.sign(d1) && Math.abs(slope) > 3 * Math.abs(d0))
      return 3 * d0;
    return slope;
  };
  if (n > 2) {
    slopes[0] = endSlope(h[0]!, h[1]!, delta[0]!, delta[1]!);
    slopes[n - 1] = endSlope(
      h[n - 2]!,
      h[n - 3]!,
      delta[n - 2]!,
      delta[n - 3]!,
    );
  } else {
    slopes[0] = slopes[n - 1] = delta[0]!;
  }
  return (x) => {
    const i = segmentIndex(points, x);
    const step = h[i]!;
    const t = (x - points[i]!.x) / step;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * points[i]!.y +
      (t3 - 2 * t2 + t) * step * slopes[i]! +
      (-2 * t3 + 3 * t2) * points[i + 1]!.y +
      (t3 - t2) * step * slopes[i + 1]!
    );
  };
}

/** The interpolating polynomial through every point, in the numerically stable barycentric form. */
function lagrange(points: readonly Point[]): Interpolant {
  const weights = points.map((point, j) =>
    points.reduce(
      (product, other, k) =>
        k === j ? product : product / (point.x - other.x),
      1,
    ),
  );
  return (x) => {
    let numerator = 0;
    let denominator = 0;
    for (let j = 0; j < points.length; j++) {
      const difference = x - points[j]!.x;
      if (difference === 0) return points[j]!.y;
      const term = weights[j]! / difference;
      numerator += term * points[j]!.y;
      denominator += term;
    }
    return numerator / denominator;
  };
}

const builders: Readonly<
  Record<InterpolationMethod, (points: readonly Point[]) => Interpolant>
> = { linear, spline: naturalSpline, pchip, lagrange };

/** Points must be sorted by x, with at least two of them. */
export function interpolate(
  method: InterpolationMethod,
  points: readonly Point[],
): Interpolant {
  if (points.length < 2) throw new Error("Interpolation needs two points");
  return builders[method](points);
}

/** Evenly spaced evaluation grid over the data range (what goes to the plot). */
export function grid(points: readonly Point[], size = 240): number[] {
  const start = points[0]!.x;
  const end = points.at(-1)!.x;
  return Array.from(
    { length: size },
    (_, index) => start + ((end - start) * index) / (size - 1),
  );
}

export interface ErrorReport {
  readonly max: number;
  readonly rmse: number;
}

const report = (errors: readonly number[]): ErrorReport => ({
  max: Math.max(...errors.map(Math.abs)),
  rmse: Math.sqrt(
    errors.reduce((sum, error) => sum + error * error, 0) / errors.length,
  ),
});

/** Error against the known function on a dense grid (only for unedited synthetic data). */
export function errorAgainstTruth(
  method: InterpolationMethod,
  points: readonly Point[],
  truth: (x: number) => number,
): ErrorReport {
  const curve = interpolate(method, points);
  return report(grid(points).map((x) => curve(x) - truth(x)));
}

/**
 * Leave-one-out error: every inner point is removed in turn and predicted from the rest. It needs
 * no ground truth, so it also rates data the visitor has edited.
 */
export function leaveOneOutError(
  method: InterpolationMethod,
  points: readonly Point[],
): ErrorReport | null {
  if (points.length < 4) return null;
  const errors = points.slice(1, -1).map((point, offset) => {
    const rest = points.filter((_, index) => index !== offset + 1);
    return interpolate(method, rest)(point.x) - point.y;
  });
  return report(errors);
}

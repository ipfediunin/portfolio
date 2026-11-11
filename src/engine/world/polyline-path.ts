import type { Point2 } from "../iso/projection";

export interface PathSample extends Point2 {
  directionX: number;
  directionY: number;
}

interface PolylinePathOptions {
  /** Connects the last point back to the first and wraps distances around the loop. */
  readonly closed?: boolean;
}

/**
 * A polyline with precomputed segment lengths, so sampling a point by travelled distance
 * is a binary search with no allocations. Vehicles and data particles move along these.
 */
export class PolylinePath {
  readonly length: number;
  readonly closed: boolean;

  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  /** cumulative[i] — distance from the start to vertex i. */
  private readonly cumulative: Float64Array;

  constructor(
    points: readonly Point2[],
    { closed = false }: PolylinePathOptions = {},
  ) {
    if (points.length < 2)
      throw new Error("PolylinePath needs at least two points");

    const vertexCount = closed ? points.length + 1 : points.length;
    this.xs = new Float64Array(vertexCount);
    this.ys = new Float64Array(vertexCount);
    this.cumulative = new Float64Array(vertexCount);

    for (let index = 0; index < vertexCount; index++) {
      const point = points[index % points.length] as Point2;
      this.xs[index] = point.x;
      this.ys[index] = point.y;
      if (index > 0) {
        const segment = Math.hypot(
          point.x - this.xs[index - 1]!,
          point.y - this.ys[index - 1]!,
        );
        this.cumulative[index] = this.cumulative[index - 1]! + segment;
      }
    }

    this.closed = closed;
    this.length = this.cumulative[vertexCount - 1]!;
  }

  /** Point at `distance` from the start: wraps on closed paths, clamps on open ones. */
  pointAt(distance: number, out: Point2 = { x: 0, y: 0 }): Point2 {
    const target = this.normalize(distance);
    const segment = this.segmentAt(target);
    const start = this.cumulative[segment]!;
    const span = this.cumulative[segment + 1]! - start;
    const t = span > 0 ? (target - start) / span : 0;
    out.x = this.xs[segment]! + (this.xs[segment + 1]! - this.xs[segment]!) * t;
    out.y = this.ys[segment]! + (this.ys[segment + 1]! - this.ys[segment]!) * t;
    return out;
  }

  /** Point plus the unit direction of travel at `distance`. */
  sampleAt(distance: number, out: PathSample): PathSample {
    this.pointAt(distance, out);
    const segment = this.segmentAt(this.normalize(distance));
    const dx = this.xs[segment + 1]! - this.xs[segment]!;
    const dy = this.ys[segment + 1]! - this.ys[segment]!;
    const length = Math.hypot(dx, dy) || 1;
    out.directionX = dx / length;
    out.directionY = dy / length;
    return out;
  }

  /** Index of the segment containing `target` (already normalized). */
  private segmentAt(target: number): number {
    let low = 0;
    let high = this.cumulative.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >>> 1;
      if (this.cumulative[middle]! <= target) low = middle;
      else high = middle;
    }
    return low;
  }

  private normalize(distance: number): number {
    if (this.length === 0) return 0;
    if (this.closed)
      return ((distance % this.length) + this.length) % this.length;
    return Math.min(Math.max(distance, 0), this.length);
  }
}

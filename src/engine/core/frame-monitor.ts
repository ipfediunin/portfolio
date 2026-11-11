interface FrameMonitorOptions {
  /** Frame time considered too slow, in ms. */
  readonly budgetMs: number;
  /** Ignore the first frames: shader compilation and texture uploads spike them. */
  readonly warmupMs?: number;
  /** How long the average must stay over budget before recommending a downgrade. */
  readonly sustainMs?: number;
  /** Exponential moving average factor, 0..1. */
  readonly smoothing?: number;
}

/** Tracks smoothed frame time and recommends a quality downgrade when the device can't keep up. */
export class FrameMonitor {
  private budgetMs: number;
  private readonly warmupMs: number;
  private readonly sustainMs: number;
  private readonly smoothing: number;

  private average = 0;
  private elapsedMs = 0;
  private overBudgetMs = 0;

  constructor({
    budgetMs,
    warmupMs = 2000,
    sustainMs = 3000,
    smoothing = 0.1,
  }: FrameMonitorOptions) {
    this.budgetMs = budgetMs;
    this.warmupMs = warmupMs;
    this.sustainMs = sustainMs;
    this.smoothing = smoothing;
  }

  get averageMs(): number {
    return this.average;
  }

  /** Records one frame; returns true when a downgrade is recommended. */
  sample(deltaMs: number): boolean {
    this.average =
      this.elapsedMs === 0
        ? deltaMs
        : this.average + (deltaMs - this.average) * this.smoothing;
    this.elapsedMs += deltaMs;
    if (this.elapsedMs < this.warmupMs) return false;

    this.overBudgetMs =
      this.average > this.budgetMs ? this.overBudgetMs + deltaMs : 0;
    if (this.overBudgetMs < this.sustainMs) return false;

    this.reset();
    return true;
  }

  /** Starts a fresh measurement, e.g. after the tier changed. */
  reset(budgetMs: number = this.budgetMs): void {
    this.budgetMs = budgetMs;
    this.average = 0;
    this.elapsedMs = 0;
    this.overBudgetMs = 0;
  }
}

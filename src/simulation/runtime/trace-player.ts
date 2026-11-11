import type { ScenarioRun, SimEvent } from "../model/events";

export type PlayerListener = (event: SimEvent) => void;

export const playbackSpeeds = [0.5, 1, 2] as const;
export type PlaybackSpeed = (typeof playbackSpeeds)[number];

/**
 * Plays compiled runs on a shared clock. It knows nothing about frames or the DOM: the caller
 * advances it with real elapsed time, and listeners receive events in time order as the clock
 * passes them. Renderers read `time` to place packets, so pause, speed and stepping just work.
 */
export class TracePlayer {
  private clock = 0;
  private speedFactor: PlaybackSpeed = 1;
  private paused = false;
  /** Pending events, sorted by time; `cursor` is the next one to emit. */
  private queue: SimEvent[] = [];
  private cursor = 0;
  private readonly listeners = new Set<PlayerListener>();
  /** When set, playback pauses right after an event matching it (step-by-step explanations). */
  private pauseFilter: ((event: SimEvent) => boolean) | null = null;

  get time(): number {
    return this.clock;
  }

  get speed(): PlaybackSpeed {
    return this.speedFactor;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get hasPending(): boolean {
    return this.cursor < this.queue.length;
  }

  subscribe(listener: PlayerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Adds compiled runs; their events must start at or after the current time. */
  schedule(runs: readonly ScenarioRun[]): void {
    const pending = this.queue.slice(this.cursor);
    for (const run of runs) pending.push(...run.events);
    this.queue = pending.sort((a, b) => a.at - b.at);
    this.cursor = 0;
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.speedFactor = speed;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  pauseAfter(filter: ((event: SimEvent) => boolean) | null): void {
    this.pauseFilter = filter;
  }

  /** Advances by real elapsed milliseconds (scaled by speed) unless paused. */
  advance(realDeltaMs: number): void {
    if (this.paused || realDeltaMs <= 0) return;
    this.runUntil(this.clock + realDeltaMs * this.speedFactor);
  }

  /** While paused: jumps to the next event time and emits everything scheduled at that instant. */
  step(): void {
    const next = this.queue[this.cursor];
    if (!next) return;
    const wasPaused = this.paused;
    this.paused = false;
    this.runUntil(next.at, true);
    this.paused = wasPaused || this.paused;
  }

  /** Drops everything that has not happened yet and rewinds nothing: the clock keeps running. */
  clearPending(): void {
    this.queue = [];
    this.cursor = 0;
  }

  private runUntil(target: number, ignorePauseFilter = false): void {
    while (this.cursor < this.queue.length) {
      const event = this.queue[this.cursor]!;
      if (event.at > target) break;
      this.cursor += 1;
      this.clock = Math.max(this.clock, event.at);
      for (const listener of this.listeners) listener(event);
      if (!ignorePauseFilter && this.pauseFilter?.(event)) {
        this.paused = true;
        return;
      }
    }
    this.clock = Math.max(this.clock, target);
    if (this.cursor >= this.queue.length) {
      this.queue = [];
      this.cursor = 0;
    }
  }
}

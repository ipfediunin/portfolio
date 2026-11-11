import type { TracePlayer } from "@/simulation/runtime/trace-player";

/** Longest frame the clock accepts; a stalled tab resumes without skipping the whole story. */
const MAX_FRAME_MS = 100;

/**
 * Drives a TracePlayer with requestAnimationFrame. `onTick` runs right after the player advanced
 * (a store folds the frame's events there), then frame listeners update the DOM imperatively.
 */
export class PlaybackClock {
  private readonly frameListeners = new Set<(time: number) => void>();
  private frame = 0;
  private lastFrameAt = 0;

  constructor(
    private readonly player: TracePlayer,
    private readonly onTick: () => void,
  ) {}

  start(): void {
    if (this.frame) return;
    this.lastFrameAt = performance.now();
    const loop = (now: number) => {
      const delta = Math.min(MAX_FRAME_MS, now - this.lastFrameAt);
      this.lastFrameAt = now;
      this.player.advance(delta);
      this.onTick();
      for (const listener of this.frameListeners) listener(this.player.time);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** Per-frame callback with the player time, for imperative DOM updates (no React re-render). */
  onFrame(listener: (time: number) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  destroy(): void {
    this.stop();
    this.frameListeners.clear();
  }
}

/** A controller whose runs can borrow the scene (see useScenePlayer). */
export interface ScenePlayback {
  readonly player: TracePlayer;
  /** Player time at which the latest run is over, captions included. */
  readonly activeRunEnd: number;
  start(): void;
  stop(): void;
  onFrame(listener: (time: number) => void): () => void;
}

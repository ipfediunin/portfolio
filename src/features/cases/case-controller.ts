import { createStore, type StoreApi } from "zustand/vanilla";

import {
  PlaybackClock,
  type ScenePlayback,
} from "@/features/playground/playback-clock";
import type { Caption, CaseRun } from "@/simulation/cases/case-script";
import { NOTE_MIN_MS } from "@/simulation/runtime/story-compiler";
import {
  TracePlayer,
  type PlaybackSpeed,
} from "@/simulation/runtime/trace-player";

export interface CaseState<Key extends string> {
  /** The explanation for the current moment of the demo, or null before the first one. */
  readonly caption: Caption<Key> | null;
  /** A demo is playing (its last caption has not run out yet). */
  readonly running: boolean;
  readonly paused: boolean;
  readonly speed: PlaybackSpeed;
}

/**
 * Plays a case study's demo: compiled runs on the scene (through the player) and their captions in
 * the DOM. The store changes only when the caption or the playback state does, not every frame.
 * Like the playground, nothing here needs the engine: without WebGL the captions still play.
 */
export class CaseController<Key extends string> implements ScenePlayback {
  readonly player = new TracePlayer();
  readonly store: StoreApi<CaseState<Key>> = createStore<CaseState<Key>>(
    () => ({ caption: null, running: false, paused: false, speed: 1 }),
  );
  private readonly clock = new PlaybackClock(this.player, () => this.sync());
  private captions: readonly Caption<Key>[] = [];
  private runEnd = 0;
  private sequence = 0;

  get activeRunEnd(): number {
    return this.runEnd;
  }

  /** Start time and sequence number for the next compiled run (run ids and seeds). */
  nextRun(): { readonly startAt: number; readonly sequence: number } {
    this.sequence += 1;
    return { startAt: this.player.time, sequence: this.sequence };
  }

  /** Plays a demo; one still playing is replaced (its packets in flight finish on their own). */
  play(caseRun: CaseRun<Key>): void {
    this.player.clearPending();
    this.player.schedule([caseRun.run]);
    this.captions = caseRun.captions;
    const lastCaption = caseRun.captions.at(-1);
    this.runEnd = Math.max(
      caseRun.run.endAt,
      lastCaption ? lastCaption.at + NOTE_MIN_MS : 0,
    );
    if (this.player.isPaused) this.player.setPaused(false);
    this.store.setState({ caption: null, running: true, paused: false });
  }

  start(): void {
    this.clock.start();
  }

  stop(): void {
    this.clock.stop();
  }

  destroy(): void {
    this.clock.destroy();
  }

  onFrame(listener: (time: number) => void): () => void {
    return this.clock.onFrame(listener);
  }

  togglePause(): void {
    const paused = !this.player.isPaused;
    this.player.setPaused(paused);
    this.store.setState({ paused });
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.player.setSpeed(speed);
    this.store.setState({ speed });
  }

  private sync(): void {
    const time = this.player.time;
    let caption: Caption<Key> | null = null;
    for (const entry of this.captions) {
      if (entry.at > time) break;
      caption = entry;
    }
    const running = time < this.runEnd;
    const state = this.store.getState();
    if (caption !== state.caption || running !== state.running)
      this.store.setState({ caption, running });
  }
}

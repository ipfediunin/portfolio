import { createStore, type StoreApi } from "zustand/vanilla";

import { cityGraph } from "@/simulation/graphs/city";
import { isLiveScenario } from "@/simulation/live/live-exchange";
import type {
  HttpResult,
  LogEntry,
  NoteKey,
  ScenarioRun,
  SimEvent,
  Span,
} from "@/simulation/model/events";
import {
  scenarios,
  type ScenarioId,
  type ScenarioOptions,
} from "@/simulation/scenarios/catalog";
import {
  SimulationSession,
  type PendingBackground,
} from "@/simulation/runtime/session";
import { compileStory } from "@/simulation/runtime/story-compiler";
import type { StoryId } from "@/simulation/stories/catalog";
import {
  TracePlayer,
  type PlaybackSpeed,
} from "@/simulation/runtime/trace-player";

import { LiveApiError, type LiveApi, type LiveFailure } from "./live-api";
import type { ChannelState, NotificationEvent } from "./live-events";
import { PlaybackClock, type ScenePlayback } from "./playback-clock";

const MAX_LOGS = 80;
const MAX_RUNS = 8;

export interface RunSummary {
  readonly runId: string;
  readonly scenarioId: string;
  readonly method: string;
  readonly path: string;
  readonly startAt: number;
  readonly status: number | null;
  readonly latencyMs: number | null;
}

/** Simulation runs in the browser; live sends the request to the real backend and replays its trace. */
export type PlaygroundMode = "simulation" | "live";

export interface PlaygroundState {
  readonly scenarioId: ScenarioId;
  readonly mode: PlaygroundMode;
  /** A live backend is configured (NEXT_PUBLIC_LIVE_API_URL). */
  readonly liveAvailable: boolean;
  /** A live request is on its way; sends wait for it. */
  readonly livePending: boolean;
  readonly liveError: LiveFailure | null;
  /** When the anonymous sandbox expires (epoch ms), once one exists. */
  readonly sandboxExpiresAt: number | null;
  /** The realtime hub's socket: pushes arrive over it, or the page polls the trace. */
  readonly liveChannel: ChannelState;
  /** The latest notification the hub pushed to this page. */
  readonly lastPush: {
    readonly event: NotificationEvent;
    readonly at: number;
  } | null;
  /** The active run replays a live trace rather than a simulation. */
  readonly activeRunLive: boolean;
  /** The district story being played, when the active run is a story rather than a request. */
  readonly storyId: StoryId | null;
  readonly body: string;
  readonly options: ScenarioOptions;
  /** Latest first. */
  readonly runs: readonly RunSummary[];
  /** The run shown in the trace and response panels. */
  readonly activeRunId: string | null;
  readonly activeRunStart: number;
  readonly activeRunEnd: number;
  readonly spans: readonly Span[];
  readonly logs: readonly LogEntry[];
  readonly response: HttpResult | null;
  readonly note: NoteKey | null;
  readonly paused: boolean;
  readonly speed: PlaybackSpeed;
  readonly stepMode: boolean;
}

function sampleBody(scenarioId: ScenarioId): string {
  const sample = scenarios[scenarioId].request.sampleBody;
  return sample ? JSON.stringify(sample, null, 2) : "";
}

function initialState(
  scenarioId: ScenarioId,
  liveAvailable: boolean,
): PlaygroundState {
  return {
    scenarioId,
    mode: "simulation",
    liveAvailable,
    livePending: false,
    liveError: null,
    sandboxExpiresAt: null,
    liveChannel: "off",
    lastPush: null,
    activeRunLive: false,
    storyId: null,
    body: sampleBody(scenarioId),
    options: scenarios[scenarioId].defaults,
    runs: [],
    activeRunId: null,
    activeRunStart: 0,
    activeRunEnd: 0,
    spans: [],
    logs: [],
    response: null,
    note: null,
    paused: false,
    speed: 1,
    stepMode: false,
  };
}

/** Folds a frame's worth of player events into the UI state in one update. */
function reduce(
  state: PlaygroundState,
  events: readonly SimEvent[],
): PlaygroundState {
  let { runs, spans, logs, response, note } = state;
  for (const event of events) {
    switch (event.type) {
      case "span.started":
        if (event.span.runId === state.activeRunId)
          spans = [...spans, event.span];
        break;
      case "log":
        logs = [...logs.slice(-(MAX_LOGS - 1)), event.entry];
        break;
      case "note":
        if (event.runId === state.activeRunId) note = event.key;
        break;
      case "response":
        runs = runs.map((run) =>
          run.runId === event.runId
            ? {
                ...run,
                status: event.result.status,
                latencyMs: event.result.latencyMs,
              }
            : run,
        );
        if (event.runId === state.activeRunId) response = event.result;
        break;
      default:
        break;
    }
  }
  return { ...state, runs, spans, logs, response, note };
}

/**
 * Owns the simulation behind the playground and the district pages: session (cache, rate limiter),
 * story compiler, player and the frame loop. React reads `store`; the scene reads `player`. Nothing
 * here depends on the engine, so everything keeps working as plain DOM when WebGL is unavailable.
 */
export class PlaygroundController implements ScenePlayback {
  readonly player = new TracePlayer();
  readonly store: StoreApi<PlaygroundState>;
  private readonly session = new SimulationSession(cityGraph);
  private readonly pending: SimEvent[] = [];
  private readonly clock = new PlaybackClock(this.player, () => this.flush());
  private storyRuns = 0;
  private readonly unsubscribe: () => void;
  private readonly unsubscribeLive: readonly (() => void)[];
  /** Stops following live jobs when the playground goes away. */
  private readonly disposed = new AbortController();

  constructor(
    initialScenario: ScenarioId = "sync-read",
    private readonly live: LiveApi | null = null,
  ) {
    this.store = createStore<PlaygroundState>(() =>
      initialState(initialScenario, live !== null),
    );
    this.unsubscribe = this.player.subscribe((event) =>
      this.pending.push(event),
    );
    this.player.pauseAfter(
      (event) => this.store.getState().stepMode && event.type === "note",
    );
    const events = live?.events;
    this.unsubscribeLive = events
      ? [
          events.onState((liveChannel) => this.store.setState({ liveChannel })),
          events.onNotification(({ event, at }) =>
            this.store.setState({ lastPush: { event, at } }),
          ),
        ]
      : [];
  }

  get activeRunEnd(): number {
    return this.store.getState().activeRunEnd;
  }

  start(): void {
    this.clock.start();
    this.live?.resumeEvents();
  }

  /** The playground left the screen: the frame loop stops and the hub's socket closes. */
  stop(): void {
    this.clock.stop();
    this.live?.pauseEvents();
  }

  destroy(): void {
    this.disposed.abort();
    this.clock.destroy();
    this.unsubscribe();
    for (const unsubscribe of this.unsubscribeLive) unsubscribe();
  }

  /** Per-frame callback with the player time, for imperative DOM updates (no React re-render). */
  onFrame(listener: (time: number) => void): () => void {
    return this.clock.onFrame(listener);
  }

  selectScenario(scenarioId: ScenarioId): void {
    this.store.setState({
      scenarioId,
      body: sampleBody(scenarioId),
      options: scenarios[scenarioId].defaults,
    });
  }

  setBody(body: string): void {
    this.store.setState({ body });
  }

  setOptions(patch: Partial<ScenarioOptions>): void {
    this.store.setState((state) => ({
      options: { ...state.options, ...patch },
    }));
  }

  setMode(mode: PlaygroundMode): void {
    if (mode === "live" && !this.live) return;
    this.store.setState({ mode, liveError: null });
  }

  /** Whether the next send goes to the live backend. */
  get sendsLive(): boolean {
    const { mode, scenarioId } = this.store.getState();
    return mode === "live" && this.live !== null && isLiveScenario(scenarioId);
  }

  send(): void {
    if (this.live && this.sendsLive) {
      void this.sendLive(this.live);
      return;
    }
    const { scenarioId, body, options } = this.store.getState();
    const spec = scenarios[scenarioId];
    this.startRuns(
      this.session.submit(
        {
          scenarioId,
          body: spec.request.method === "POST" ? body : null,
          options,
        },
        { playbackTime: this.player.time, wallTime: performance.now() },
      ),
      false,
    );
  }

  /** Deletes the live sandbox and everything made in it. */
  async deleteSandbox(): Promise<void> {
    if (!this.live) return;
    try {
      await this.live.deleteSandbox();
      this.store.setState({
        sandboxExpiresAt: null,
        liveError: null,
        lastPush: null,
      });
    } catch (error) {
      this.store.setState({ liveError: this.failureOf(error) });
    }
  }

  /**
   * Sends the request (a burst for the rate-limit scenario) and replays the service's traces. Work
   * the service queued is followed in the background: its part of the trace is replayed when the
   * worker is done, as the continuation of the same run.
   */
  private async sendLive(live: LiveApi): Promise<void> {
    const { scenarioId, body, options, livePending } = this.store.getState();
    if (livePending) return;
    const spec = scenarios[scenarioId];
    const input = {
      scenarioId,
      body: spec.request.method === "POST" ? body : null,
      options,
    };
    this.store.setState({ livePending: true, liveError: null });
    try {
      const exchanges = await Promise.all(
        Array.from({ length: spec.burst }, () =>
          live.send({
            method: spec.request.method,
            path: spec.request.path,
            body: input.body,
            authorized: options.authorized,
            noCache: options.cache === "miss",
            ...(spec.controls.includes("failures")
              ? { failAttempts: options.providerFailures }
              : {}),
            ...(spec.controls.includes("provider")
              ? { providerDown: options.providerDown }
              : {}),
            signWebhook: spec.request.path.startsWith("/webhooks/"),
          }),
        ),
      );
      const replay = this.session.replay(
        input,
        { playbackTime: this.player.time, wallTime: performance.now() },
        exchanges,
      );
      this.startRuns(replay.runs, true);
      this.store.setState({ sandboxExpiresAt: live.sandboxExpiresAt });
      for (const pending of replay.pending)
        void this.followBackground(live, pending);
    } catch (error) {
      this.store.setState({ liveError: this.failureOf(error) });
    } finally {
      this.store.setState({ livePending: false });
    }
  }

  private async followBackground(
    live: LiveApi,
    pending: PendingBackground,
  ): Promise<void> {
    const { signal } = this.disposed;
    try {
      const background = await live.awaitBackground(pending.traceId, signal);
      const continuation = pending.resume(background, this.player.time);
      this.player.schedule([continuation]);
      this.store.setState((state) =>
        state.activeRunId === pending.runId
          ? {
              activeRunEnd: Math.max(state.activeRunEnd, continuation.endAt),
            }
          : {},
      );
    } catch (error) {
      if (signal.aborted) return; // the playground was closed meanwhile
      this.store.setState({ liveError: this.failureOf(error) });
    }
  }

  private failureOf(error: unknown): LiveFailure {
    if (error instanceof LiveApiError) return error.failure;
    throw error;
  }

  private startRuns(compiled: readonly ScenarioRun[], live: boolean): void {
    const { scenarioId, runs } = this.store.getState();
    const spec = scenarios[scenarioId];
    const active = compiled.at(-1);
    if (!active) return;
    this.player.schedule(compiled);
    const summaries: RunSummary[] = compiled.map((run) => ({
      runId: run.runId,
      scenarioId,
      method: spec.request.method,
      path: spec.request.path,
      startAt: run.startAt,
      status: null,
      latencyMs: null,
    }));
    this.store.setState({
      storyId: null,
      runs: [...summaries.reverse(), ...runs].slice(0, MAX_RUNS),
      activeRunId: active.runId,
      activeRunLive: live,
      activeRunStart: active.startAt,
      activeRunEnd: active.endAt,
      spans: [],
      response: null,
      note: null,
    });
  }

  /** Plays a district story: no input, no session state, the same events as a request. */
  playStory(storyId: StoryId): void {
    this.storyRuns += 1;
    const run = compileStory(cityGraph, storyId, {
      startAt: this.player.time,
      sequence: this.storyRuns,
    });
    this.player.schedule([run]);
    this.store.setState({
      storyId,
      activeRunId: run.runId,
      activeRunLive: false,
      activeRunStart: run.startAt,
      activeRunEnd: run.endAt,
      spans: [],
      response: null,
      note: null,
    });
  }

  togglePause(): void {
    const paused = !this.player.isPaused;
    this.player.setPaused(paused);
    this.store.setState({ paused });
  }

  step(): void {
    this.player.setPaused(true);
    this.player.step();
    this.flush();
    this.store.setState({ paused: true });
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.player.setSpeed(speed);
    this.store.setState({ speed });
  }

  setStepMode(stepMode: boolean): void {
    this.store.setState({ stepMode });
    if (!stepMode && this.player.isPaused) {
      this.player.setPaused(false);
      this.store.setState({ paused: false });
    }
  }

  /** Clears the cache and the rate limiter, e.g. to show a cache miss again (live: the sandbox's). */
  resetSystem(): void {
    this.session.reset();
    if (!this.live) return;
    this.live.reset().then(
      () => this.store.setState({ liveError: null }),
      (error: unknown) =>
        this.store.setState({ liveError: this.failureOf(error) }),
    );
  }

  private flush(): void {
    const pausedNow = this.player.isPaused;
    if (this.pending.length === 0 && pausedNow === this.store.getState().paused)
      return;
    const events = this.pending.splice(0, this.pending.length);
    this.store.setState((state) => ({
      ...reduce(state, events),
      paused: pausedNow,
    }));
  }
}

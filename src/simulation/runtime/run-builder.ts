import type {
  HttpResult,
  LogLevel,
  NoteKey,
  PacketKind,
  PacketTone,
  RunRequest,
  ScenarioRun,
  SimEvent,
  Span,
} from "../model/events";
import type { NodeStatus } from "../model/graph";
import type { LatencyRange } from "../scenarios/catalog";
import type { SeededRng } from "./seeded-rng";

/** Playback ms per tile travelled; jobs ride slower vans, events fly faster. */
const MS_PER_TILE: Readonly<Record<PacketKind, number>> = {
  request: 80,
  response: 80,
  job: 115,
  event: 55,
};
const MIN_HOP_MS = 240;
/** Realistic ms are stretched into visible playback ms, within readable bounds. */
const PLAYBACK_PER_REPORTED_MS = 9;
const MIN_WORK_MS = 280;
const MAX_WORK_MS = 1200;
const NETWORK_LATENCY: LatencyRange = [1, 3];

interface RunContext {
  readonly rng: SeededRng;
  readonly linkLengthTiles: (linkId: string) => number;
}

/** Accumulates the events of one request while the compiler walks its steps. */
export class RunBuilder {
  /** Realistic latency of the synchronous path, reported with the response. */
  syncLatencyMs = 0;
  private readonly events: SimEvent[] = [];
  private packetCount = 0;
  private spanCount = 0;
  /** Events already handed out by `build`. */
  private built = 0;

  constructor(
    readonly runId: string,
    readonly traceId: string,
    private readonly scenarioId: string,
    readonly startAt: number,
    request: RunRequest | null,
    private readonly context: RunContext,
  ) {
    this.events.push({
      type: "run.started",
      at: startAt,
      runId,
      traceId,
      scenarioId,
      ...(request ? { request } : {}),
    });
  }

  pick(range: LatencyRange): number {
    return Math.round(this.context.rng.range(range[0], range[1]) * 10) / 10;
  }

  newPacket(): string {
    this.packetCount += 1;
    return `${this.runId}.p${this.packetCount}`;
  }

  /** Moves a packet along a link; returns the arrival time. Synchronous hops add network latency. */
  hop(
    packetId: string,
    kind: PacketKind,
    tone: PacketTone,
    linkId: string,
    reverse: boolean,
    departAt: number,
    onSyncPath: boolean,
  ): number {
    const duration = Math.max(
      MIN_HOP_MS,
      this.context.linkLengthTiles(linkId) * MS_PER_TILE[kind],
    );
    const arriveAt = departAt + duration;
    this.events.push({
      type: "packet.hop",
      at: departAt,
      hop: {
        packetId,
        runId: this.runId,
        kind,
        tone,
        linkId,
        reverse,
        departAt,
        arriveAt,
      },
    });
    if (onSyncPath) this.syncLatencyMs += this.pick(NETWORK_LATENCY);
    return arriveAt;
  }

  /** Work at a node: the span lasts a readable playback time but reports a realistic latency. */
  span(
    nodeId: string,
    name: string,
    startAt: number,
    latency: LatencyRange,
    options: {
      readonly ok?: boolean;
      readonly note?: NoteKey;
      readonly onSyncPath: boolean;
      /** A measured latency (live mode) instead of one picked from `latency`. */
      readonly reportedMs?: number;
    },
  ): number {
    const reportedMs = options.reportedMs ?? this.pick(latency);
    const duration = Math.min(
      MAX_WORK_MS,
      Math.max(MIN_WORK_MS, reportedMs * PLAYBACK_PER_REPORTED_MS),
    );
    this.spanCount += 1;
    const span: Span = {
      id: `${this.runId}.s${this.spanCount}`,
      runId: this.runId,
      nodeId,
      name,
      startAt,
      endAt: startAt + duration,
      reportedMs,
      ok: options.ok ?? true,
    };
    this.events.push({ type: "span.started", at: startAt, span });
    if (options.note) this.note(startAt, options.note);
    this.events.push({ type: "span.finished", at: span.endAt, span });
    if (options.onSyncPath) this.syncLatencyMs += reportedMs;
    return span.endAt;
  }

  status(at: number, nodeId: string, status: NodeStatus, text: string): void {
    this.events.push({
      type: "node.status",
      at,
      runId: this.runId,
      nodeId,
      status,
      text,
    });
  }

  log(at: number, level: LogLevel, nodeId: string, message: string): void {
    this.events.push({
      type: "log",
      at,
      entry: {
        at,
        runId: this.runId,
        traceId: this.traceId,
        level,
        nodeId,
        message,
      },
    });
  }

  note(at: number, key: NoteKey): void {
    this.events.push({ type: "note", at, runId: this.runId, key });
  }

  response(at: number, result: HttpResult): void {
    this.events.push({ type: "response", at, runId: this.runId, result });
  }

  /**
   * The events recorded since the previous call. The first call returns the whole run; a later
   * one returns its continuation (a live job whose spans arrived after the response), with the
   * same run id, so the player and the panels treat it as the same request.
   */
  build(): ScenarioRun {
    const fresh = this.events.slice(this.built);
    this.built = this.events.length;
    // Stable sort: events at the same instant keep the causal order they were recorded in.
    const sorted = [...fresh].sort((a, b) => a.at - b.at);
    const endAt = sorted.at(-1)?.at ?? this.startAt;
    sorted.push({ type: "run.finished", at: endAt, runId: this.runId });
    return {
      runId: this.runId,
      traceId: this.traceId,
      scenarioId: this.scenarioId,
      startAt: this.startAt,
      endAt,
      events: sorted,
    };
  }
}

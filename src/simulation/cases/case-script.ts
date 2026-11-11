import type {
  LogLevel,
  PacketKind,
  PacketTone,
  ScenarioRun,
} from "../model/events";
import {
  linkLengthTiles,
  type LinkSpec,
  type NodeStatus,
  type WorldGraph,
} from "../model/graph";
import type { LatencyRange } from "../scenarios/catalog";
import { RunBuilder } from "../runtime/run-builder";
import { SeededRng } from "../runtime/seeded-rng";
import { NOTE_MIN_MS } from "../runtime/story-compiler";

/** Values a caption template fills in, e.g. "{count} fragments". Formatted by the page. */
export type CaptionValues = Readonly<Record<string, string | number>>;

/** One explanation on the case scene: a key into the case's copy, shown from `at` on. */
export interface Caption<Key extends string> {
  readonly at: number;
  readonly key: Key;
  readonly values: CaptionValues;
}

/** What a case demo plays: the scene's events plus the explanations that go with them. */
export interface CaseRun<Key extends string> {
  readonly run: ScenarioRun;
  readonly captions: readonly Caption<Key>[];
}

interface HopOptions {
  readonly kind?: PacketKind;
  readonly tone?: PacketTone;
  readonly reverse?: boolean;
}

/**
 * Writes a case demo as a script: packets travel links, nodes work, captions explain. It produces
 * the same events as a playground request (through RunBuilder), so the scene, the player and the
 * timing rules are shared. A cursor tracks the time; `parallel` runs branches side by side.
 */
export class CaseScript<Key extends string> {
  private readonly builder: RunBuilder;
  private readonly links: ReadonlyMap<string, LinkSpec>;
  private readonly nodeIds: ReadonlySet<string>;
  private readonly captions: Caption<Key>[] = [];
  private lastCaptionAt = Number.NEGATIVE_INFINITY;
  private cursor: number;

  constructor(
    graph: WorldGraph,
    scenarioId: string,
    {
      startAt,
      sequence,
    }: { readonly startAt: number; readonly sequence: number },
  ) {
    this.links = new Map(graph.links.map((link) => [link.id, link]));
    this.nodeIds = new Set(graph.nodes.map((node) => node.id));
    const rng = new SeededRng(hashSeed(scenarioId, sequence));
    this.builder = new RunBuilder(
      `${scenarioId}-${sequence}`,
      Math.floor(rng.next() * 0xffffff)
        .toString(16)
        .padStart(6, "0"),
      scenarioId,
      startAt,
      null,
      {
        rng,
        linkLengthTiles: (linkId) => linkLengthTiles(this.link(linkId)),
      },
    );
    this.cursor = startAt;
  }

  get time(): number {
    return this.cursor;
  }

  /** Realistic latency of everything so far (work plus network), as a trace would report it. */
  get reportedMs(): number {
    return Math.round(this.builder.syncLatencyMs * 10) / 10;
  }

  /** A packet travels the link; the script continues when it arrives. */
  hop(linkId: string, options: HopOptions = {}): this {
    this.link(linkId);
    this.cursor = this.builder.hop(
      this.builder.newPacket(),
      options.kind ?? "request",
      options.tone ?? "neutral",
      linkId,
      options.reverse ?? false,
      this.cursor,
      true,
    );
    return this;
  }

  /** Work at a node: a readable span on the scene that reports a realistic latency. */
  work(nodeId: string, name: string, latency: LatencyRange, ok = true): this {
    this.cursor = this.builder.span(
      this.node(nodeId),
      name,
      this.cursor,
      latency,
      {
        ok,
        onSyncPath: true,
      },
    );
    return this;
  }

  /** A status card above the node (stays until the node's next status). */
  status(nodeId: string, status: NodeStatus, text: string): this {
    this.builder.status(this.cursor, this.node(nodeId), status, text);
    return this;
  }

  log(nodeId: string, level: LogLevel, message: string): this {
    this.builder.log(this.cursor, level, this.node(nodeId), message);
    return this;
  }

  /** An explanation; it stays at least NOTE_MIN_MS before the next one, so it can be read. */
  caption(key: Key, values: CaptionValues = {}): this {
    const at = Math.max(this.cursor, this.lastCaptionAt + NOTE_MIN_MS);
    this.lastCaptionAt = at;
    this.captions.push({ at, key, values });
    this.cursor = at;
    return this;
  }

  pause(ms: number): this {
    this.cursor += ms;
    return this;
  }

  /** Branches start together, `stagger` ms apart; the script continues when the last one ends. */
  parallel(branches: readonly ((script: this) => void)[], stagger = 0): this {
    const start = this.cursor;
    let end = start;
    branches.forEach((branch, index) => {
      this.cursor = start + index * stagger;
      branch(this);
      end = Math.max(end, this.cursor);
    });
    this.cursor = end;
    return this;
  }

  build(): CaseRun<Key> {
    return { run: this.builder.build(), captions: this.captions };
  }

  private link(linkId: string): LinkSpec {
    const spec = this.links.get(linkId);
    if (!spec) throw new Error(`Case script uses unknown link "${linkId}"`);
    return spec;
  }

  private node(nodeId: string): string {
    if (!this.nodeIds.has(nodeId))
      throw new Error(`Case script uses unknown node "${nodeId}"`);
    return nodeId;
  }
}

/** Stable seed per scenario and run, so the same demo looks the same on a replay. */
function hashSeed(id: string, sequence: number): number {
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ Math.imul(sequence, 2654435761)) >>> 0;
}

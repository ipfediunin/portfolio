import type { ScenarioRun } from "../model/events";
import {
  linkLengthTiles,
  type LinkSpec,
  type SystemGraph,
} from "../model/graph";
import { stories, type StoryId, type StoryStep } from "../stories/catalog";
import { RunBuilder } from "./run-builder";
import { SeededRng } from "./seeded-rng";

/**
 * An explanation stays at least this long (playback ms at 1×) before the next one replaces it:
 * the scene may be quick, the visitor still has to read.
 */
export const NOTE_MIN_MS = 3400;

/** Stable seed per story and run, so a replay of the same story looks the same. */
function storySeed(storyId: StoryId, sequence: number): number {
  let hash = 2166136261;
  for (const char of storyId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ Math.imul(sequence, 2654435761)) >>> 0;
}

/**
 * Compiles a district story into a run: the same events as a playground request (packets,
 * spans, statuses, notes, logs), so the player, the scene and the narration need nothing new.
 */
export function compileStory(
  graph: SystemGraph,
  storyId: StoryId,
  {
    startAt,
    sequence,
  }: { readonly startAt: number; readonly sequence: number },
): ScenarioRun {
  const links = new Map(graph.links.map((link) => [link.id, link]));
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const link = (linkId: string): LinkSpec => {
    const spec = links.get(linkId);
    if (!spec)
      throw new Error(`Story "${storyId}" uses unknown link "${linkId}"`);
    return spec;
  };
  const node = (nodeId: string): string => {
    if (!nodeIds.has(nodeId))
      throw new Error(`Story "${storyId}" uses unknown node "${nodeId}"`);
    return nodeId;
  };

  const rng = new SeededRng(storySeed(storyId, sequence));
  const traceId = Math.floor(rng.next() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  const run = new RunBuilder(
    `story-${sequence}`,
    traceId,
    storyId,
    startAt,
    null,
    { rng, linkLengthTiles: (linkId) => linkLengthTiles(link(linkId)) },
  );

  let lastNoteAt = Number.NEGATIVE_INFINITY;

  /** Runs one step starting at `at`; returns when the story may continue. */
  function execute(step: StoryStep, at: number): number {
    switch (step.type) {
      case "hop":
        link(step.link);
        return run.hop(
          run.newPacket(),
          step.kind,
          step.tone,
          step.link,
          step.reverse,
          at,
          false,
        );
      case "work":
        return run.span(node(step.node), step.name, at, step.latency, {
          ok: step.ok,
          onSyncPath: false,
        });
      case "status":
        run.status(at, node(step.node), step.status, step.text);
        return at;
      case "note": {
        const noteAt = Math.max(at, lastNoteAt + NOTE_MIN_MS);
        lastNoteAt = noteAt;
        run.note(noteAt, step.key);
        return noteAt;
      }
      case "log":
        run.log(at, step.level, node(step.node), step.message);
        return at;
      case "pause":
        return at + step.ms;
      case "together":
        return step.steps.reduce(
          (end, inner, index) =>
            Math.max(end, execute(inner, at + index * step.stagger)),
          at,
        );
    }
  }

  let t = startAt;
  for (const step of stories[storyId].steps) t = execute(step, t);
  return run.build();
}

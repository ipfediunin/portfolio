import { describe, expect, it } from "vitest";

import { cityGraph } from "../graphs/city";
import type { SimEvent } from "../model/events";
import { districtEntries, storyIds } from "../stories/catalog";
import { compileStory, NOTE_MIN_MS } from "./story-compiler";

const hops = (events: readonly SimEvent[]) =>
  events.flatMap((event) => (event.type === "packet.hop" ? [event.hop] : []));

describe("story compiler", () => {
  it("compiles every story against the city graph", () => {
    for (const storyId of storyIds) {
      const run = compileStory(cityGraph, storyId, { startAt: 0, sequence: 1 });
      expect(run.events[0]?.type).toBe("run.started");
      expect(run.events.at(-1)?.type).toBe("run.finished");
      expect(run.events.some((event) => event.type === "note")).toBe(true);
      // Events are in playback order.
      run.events.slice(1).forEach((event, index) => {
        expect(event.at).toBeGreaterThanOrEqual(run.events[index]!.at);
      });
    }
  });

  it("waits for a packet to arrive before the next step", () => {
    const run = compileStory(cityGraph, "webhook-idempotency", {
      startAt: 1000,
      sequence: 1,
    });
    const [first, second] = hops(run.events);
    expect(first?.linkId).toBe("l.provider-payments");
    expect(first?.departAt).toBe(1000);
    // Signature check and idempotency check happen in between.
    expect(second?.departAt).toBeGreaterThan(first!.arriveAt);
  });

  it("sends staggered packets together and continues after the last one", () => {
    const run = compileStory(cityGraph, "framework-choice", {
      startAt: 0,
      sequence: 1,
    });
    const burst = hops(run.events).filter(
      (hop) => hop.linkId === "l.gateway-orders",
    );
    expect(burst).toHaveLength(4);
    expect(burst[1]!.departAt - burst[0]!.departAt).toBe(260);
    const flaskNote = run.events.find(
      (event) => event.type === "note" && event.key === "choiceFlask",
    );
    expect(flaskNote!.at).toBeGreaterThan(burst.at(-1)!.arriveAt);
  });

  it("keeps every explanation on screen long enough to read", () => {
    for (const storyId of storyIds) {
      const notes = compileStory(cityGraph, storyId, {
        startAt: 0,
        sequence: 1,
      }).events.filter((event) => event.type === "note");
      notes.slice(1).forEach((note, index) => {
        expect(note.at - notes[index]!.at).toBeGreaterThanOrEqual(NOTE_MIN_MS);
      });
    }
  });

  it("is deterministic per run and starts no HTTP request", () => {
    const a = compileStory(cityGraph, "docker-image", {
      startAt: 0,
      sequence: 3,
    });
    const b = compileStory(cityGraph, "docker-image", {
      startAt: 0,
      sequence: 3,
    });
    expect(a).toEqual(b);
    const started = a.events[0];
    expect(started?.type === "run.started" && started.request).toBeUndefined();
  });

  it("offers every story on exactly one district page", () => {
    const offered = Object.values(districtEntries)
      .flat()
      .flatMap((entry) => (entry.kind === "story" ? [entry.id] : []));
    expect([...offered].sort()).toEqual([...storyIds].sort());
  });
});

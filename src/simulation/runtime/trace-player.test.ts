import { describe, expect, it } from "vitest";

import type { ScenarioRun, SimEvent } from "../model/events";
import { TracePlayer } from "./trace-player";

function run(runId: string, times: readonly number[]): ScenarioRun {
  const events: SimEvent[] = times.map((at, index) => ({
    type: "log",
    at,
    entry: {
      at,
      runId,
      traceId: "t",
      level: "info",
      nodeId: "gateway",
      message: `${runId}#${index}`,
    },
  }));
  return {
    runId,
    traceId: "t",
    scenarioId: "sync-read",
    startAt: times[0] ?? 0,
    endAt: times.at(-1) ?? 0,
    events,
  };
}

function collect(player: TracePlayer): string[] {
  const seen: string[] = [];
  player.subscribe((event) => {
    if (event.type === "log") seen.push(event.entry.message);
  });
  return seen;
}

describe("TracePlayer", () => {
  it("emits events in time order as the clock passes them", () => {
    const player = new TracePlayer();
    const seen = collect(player);
    player.schedule([run("a", [0, 100, 300]), run("b", [50, 200])]);
    player.advance(120);
    expect(seen).toEqual(["a#0", "b#0", "a#1"]);
    player.advance(1000);
    expect(seen).toEqual(["a#0", "b#0", "a#1", "b#1", "a#2"]);
    expect(player.hasPending).toBe(false);
  });

  it("scales time by speed and freezes while paused", () => {
    const player = new TracePlayer();
    player.setSpeed(2);
    player.advance(100);
    expect(player.time).toBe(200);
    player.setPaused(true);
    player.advance(100);
    expect(player.time).toBe(200);
  });

  it("steps to the next event while paused", () => {
    const player = new TracePlayer();
    const seen = collect(player);
    player.schedule([run("a", [500, 500, 900])]);
    player.setPaused(true);
    player.step();
    expect(seen).toEqual(["a#0", "a#1"]);
    expect(player.time).toBe(500);
    expect(player.isPaused).toBe(true);
  });

  it("pauses after events matching the pause filter", () => {
    const player = new TracePlayer();
    const seen = collect(player);
    player.schedule([run("a", [10, 20, 30])]);
    player.pauseAfter(
      (event) => event.type === "log" && event.entry.message === "a#1",
    );
    player.advance(1000);
    expect(seen).toEqual(["a#0", "a#1"]);
    expect(player.isPaused).toBe(true);
    expect(player.time).toBe(20);
  });

  it("merges runs scheduled later with pending ones", () => {
    const player = new TracePlayer();
    const seen = collect(player);
    player.schedule([run("a", [100, 300])]);
    player.advance(150);
    player.schedule([run("b", [200])]);
    player.advance(500);
    expect(seen).toEqual(["a#0", "b#0", "a#1"]);
  });
});

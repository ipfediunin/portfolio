import { describe, expect, it } from "vitest";

import { compileClose, compileSend } from "./compile";
import {
  closeConnection,
  deskIds,
  isComplete,
  segmentCount,
  sendMessage,
  type DeskId,
} from "./model";

const everyone = new Set<DeskId>(deskIds);

describe("TCP", () => {
  it("opens the connection with a three-way handshake first", () => {
    const report = sendMessage({
      transport: "tcp",
      sender: "desk-1",
      parts: 2,
      lossRate: 0,
      seed: 1,
      connected: new Set(["desk-2", "desk-3", "desk-4"]),
    });
    expect(
      report.events
        .filter((event) => event.kind === "handshake")
        .map((event) => (event.kind === "handshake" ? event.segment : null)),
    ).toEqual(["SYN", "SYN-ACK", "ACK"]);
    expect(report.connected.has("desk-1")).toBe(true);
  });

  it("delivers every part in order to every connected desk despite losses", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const report = sendMessage({
        transport: "tcp",
        sender: "desk-2",
        parts: 3,
        lossRate: 0.4,
        seed,
        connected: everyone,
      });
      for (const desk of ["desk-1", "desk-3", "desk-4"] as const)
        expect(isComplete(report.received[desk] ?? [], 3)).toBe(true);
      expect(report.retransmitted).toBe(report.lost);
    }
  });

  it("cannot reach a desk without an open connection", () => {
    const report = sendMessage({
      transport: "tcp",
      sender: "desk-1",
      parts: 1,
      lossRate: 0,
      seed: 3,
      connected: new Set(["desk-1", "desk-2"]),
    });
    expect(report.offline).toEqual(["desk-3", "desk-4"]);
    expect(report.received["desk-3"]).toBeUndefined();
  });
});

describe("UDP", () => {
  it("loses datagrams for good and never resends them", () => {
    let incomplete = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const report = sendMessage({
        transport: "udp",
        sender: "desk-1",
        parts: 3,
        lossRate: 0.4,
        seed,
        connected: new Set(),
      });
      expect(report.retransmitted).toBe(0);
      expect(report.events.some((event) => event.kind === "handshake")).toBe(
        false,
      );
      incomplete += deskIds
        .filter((desk) => desk !== "desk-1")
        .filter((desk) => !isComplete(report.received[desk] ?? [], 3)).length;
    }
    expect(incomplete).toBeGreaterThan(20);
  });

  it("arrives complete without losses, though possibly out of order", () => {
    const report = sendMessage({
      transport: "udp",
      sender: "desk-3",
      parts: 4,
      lossRate: 0,
      seed: 9,
      connected: everyone,
    });
    for (const desk of ["desk-1", "desk-2", "desk-4"] as const)
      expect([...(report.received[desk] ?? [])].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("messenger runs", () => {
  it("splits messages into one to four parts", () => {
    expect(segmentCount("hi")).toBe(1);
    expect(segmentCount("x".repeat(40))).toBe(3);
    expect(segmentCount("x".repeat(400))).toBe(4);
  });

  it("compiles sends over both transports and a disconnect", () => {
    for (const transport of ["tcp", "udp"] as const) {
      const report = sendMessage({
        transport,
        sender: "desk-1",
        parts: 2,
        lossRate: 0.2,
        seed: 5,
        connected: new Set(["desk-3"]),
      });
      const run = compileSend(report, "desk-1", { startAt: 0, sequence: 1 });
      expect(run.captions.at(-1)?.key).toBe(
        transport === "tcp" ? "tcpDone" : "udpDone",
      );
    }
    const close = compileClose(closeConnection("desk-2"), "desk-2", {
      startAt: 0,
      sequence: 2,
    });
    expect(close.captions.map((caption) => caption.key)).toEqual(["close"]);
  });
});

import { SeededRng } from "../../runtime/seeded-rng";

/**
 * The network behind the messenger demo, at the level of segments: a TCP connection is opened
 * with a three-way handshake, data segments are numbered and acknowledged, and a lost segment is
 * sent again until it arrives — so every recipient gets every part, in order. UDP sends datagrams
 * with no connection and no acknowledgement: a lost one is gone, and arrivals may be reordered.
 * Losses come from a seeded generator, so a run can be replayed exactly.
 */

export const deskIds = ["desk-1", "desk-2", "desk-3", "desk-4"] as const;
export type DeskId = (typeof deskIds)[number];
export type Endpoint = DeskId | "server";
export type Transport = "tcp" | "udp";

export type PacketEvent =
  | {
      readonly kind: "handshake";
      readonly desk: DeskId;
      readonly segment: "SYN" | "SYN-ACK" | "ACK";
      readonly lost: boolean;
    }
  | {
      readonly kind: "segment";
      readonly from: Endpoint;
      readonly to: Endpoint;
      readonly seq: number;
      readonly attempt: number;
      readonly lost: boolean;
    }
  | {
      readonly kind: "ack";
      readonly from: Endpoint;
      readonly to: Endpoint;
      readonly seq: number;
    }
  | {
      readonly kind: "datagram";
      readonly from: Endpoint;
      readonly to: Endpoint;
      readonly seq: number;
      readonly lost: boolean;
    }
  | {
      readonly kind: "close";
      readonly desk: DeskId;
      readonly segment: "FIN" | "ACK";
    };

export interface DeliveryReport {
  readonly transport: Transport;
  readonly events: readonly PacketEvent[];
  readonly parts: number;
  /** Transmissions, retransmissions included. */
  readonly sent: number;
  readonly lost: number;
  readonly retransmitted: number;
  /** Parts each recipient received, in arrival order. Offline TCP recipients are absent. */
  readonly received: Readonly<Partial<Record<DeskId, readonly number[]>>>;
  /** Recipients the server could not reach over TCP: they have no open connection. */
  readonly offline: readonly DeskId[];
  /** Connections open after the send (the sender's opens on demand). */
  readonly connected: ReadonlySet<DeskId>;
}

/** A safety net for the demo: at 40% loss six attempts all fail about once in 250 segments. */
const MAX_ATTEMPTS = 8;
/** Share of UDP arrivals that overtake the previous datagram. */
const REORDER_CHANCE = 0.3;

/** Splits a message into the parts the transport carries (1–4 of them). */
export function segmentCount(message: string, bytesPerPart = 16): number {
  const bytes = new TextEncoder().encode(message.trim()).length;
  return Math.min(4, Math.max(1, Math.ceil(bytes / bytesPerPart)));
}

export function sendMessage({
  transport,
  sender,
  parts,
  lossRate,
  seed,
  connected,
}: {
  readonly transport: Transport;
  readonly sender: DeskId;
  readonly parts: number;
  readonly lossRate: number;
  readonly seed: number;
  readonly connected: ReadonlySet<DeskId>;
}): DeliveryReport {
  const rng = new SeededRng(seed);
  const events: PacketEvent[] = [];
  const lost = () => rng.chance(lossRate);
  let sent = 0;
  let lostCount = 0;
  let retransmitted = 0;
  const recipients = deskIds.filter((desk) => desk !== sender);
  const received: Partial<Record<DeskId, number[]>> = {};
  const open = new Set(connected);

  /** One numbered segment over an open connection, repeated until it arrives. */
  function reliable(from: Endpoint, to: Endpoint, seq: number): void {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const missing = attempt < MAX_ATTEMPTS && lost();
      sent += 1;
      if (attempt > 1) retransmitted += 1;
      if (missing) lostCount += 1;
      events.push({ kind: "segment", from, to, seq, attempt, lost: missing });
      if (!missing) {
        events.push({ kind: "ack", from: to, to: from, seq });
        return;
      }
    }
  }

  if (transport === "tcp") {
    if (!open.has(sender)) {
      for (const segment of ["SYN", "SYN-ACK", "ACK"] as const) {
        // A lost handshake segment is sent again after a timeout, like a data segment.
        for (let attempt = 1; attempt < MAX_ATTEMPTS && lost(); attempt++) {
          sent += 1;
          lostCount += 1;
          retransmitted += 1;
          events.push({ kind: "handshake", desk: sender, segment, lost: true });
        }
        sent += 1;
        events.push({ kind: "handshake", desk: sender, segment, lost: false });
      }
      open.add(sender);
    }
    for (let seq = 1; seq <= parts; seq++) reliable(sender, "server", seq);
    for (const desk of recipients) {
      if (!open.has(desk)) continue;
      received[desk] = [];
      for (let seq = 1; seq <= parts; seq++) {
        reliable("server", desk, seq);
        received[desk].push(seq);
      }
    }
    return {
      transport,
      events,
      parts,
      sent,
      lost: lostCount,
      retransmitted,
      received,
      offline: recipients.filter((desk) => !open.has(desk)),
      connected: open,
    };
  }

  const atServer: number[] = [];
  for (let seq = 1; seq <= parts; seq++) {
    const missing = lost();
    sent += 1;
    if (missing) lostCount += 1;
    events.push({
      kind: "datagram",
      from: sender,
      to: "server",
      seq,
      lost: missing,
    });
    if (!missing) atServer.push(seq);
  }
  for (const desk of recipients) {
    const arrivals: number[] = [];
    for (const seq of atServer) {
      const missing = lost();
      sent += 1;
      if (missing) lostCount += 1;
      events.push({
        kind: "datagram",
        from: "server",
        to: desk,
        seq,
        lost: missing,
      });
      if (missing) continue;
      if (arrivals.length > 0 && rng.chance(REORDER_CHANCE))
        arrivals.splice(arrivals.length - 1, 0, seq);
      else arrivals.push(seq);
    }
    received[desk] = arrivals;
  }
  return {
    transport,
    events,
    parts,
    sent,
    lost: lostCount,
    retransmitted,
    received,
    offline: [],
    connected: open,
  };
}

/** Opening a connection on its own (the desk comes online): the three-way handshake. */
export function openConnection(desk: DeskId): PacketEvent[] {
  return (["SYN", "SYN-ACK", "ACK"] as const).map((segment) => ({
    kind: "handshake",
    desk,
    segment,
    lost: false,
  }));
}

/** Closing a connection: FIN from the client, ACK from the server. */
export function closeConnection(desk: DeskId): PacketEvent[] {
  return [
    { kind: "close", desk, segment: "FIN" },
    { kind: "close", desk, segment: "ACK" },
  ];
}

/** Whether a recipient got every part exactly once and in order. */
export function isComplete(
  received: readonly number[],
  parts: number,
): boolean {
  return (
    received.length === parts &&
    received.every((seq, index) => seq === index + 1)
  );
}

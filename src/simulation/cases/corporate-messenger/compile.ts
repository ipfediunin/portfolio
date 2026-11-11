import { CaseScript, type CaseRun } from "../case-script";
import { corporateMessengerGraph, deskNode, tcpLink, udpLink } from "./graph";
import {
  deskIds,
  isComplete,
  type DeliveryReport,
  type DeskId,
  type PacketEvent,
} from "./model";

export type MessengerCaption =
  | "tcpConnect"
  | "tcpSend"
  | "tcpLoss"
  | "tcpForward"
  | "tcpOffline"
  | "tcpDone"
  | "udpSend"
  | "udpForward"
  | "udpDone"
  | "close";

type Script = CaseScript<MessengerCaption>;
type Next = { readonly startAt: number; readonly sequence: number };

export const deskName = (desk: DeskId) => `Desk ${deskIds.indexOf(desk) + 1}`;

/** Draws one packet event: TCP along the desk's street, UDP through the air, ACKs back fast. */
function drawEvent(s: Script, event: PacketEvent): void {
  switch (event.kind) {
    case "handshake": {
      const toServer = event.segment !== "SYN-ACK";
      s.hop(tcpLink(event.desk), {
        kind: toServer ? "request" : "response",
        tone: event.lost ? "failed" : "neutral",
        reverse: !toServer,
      });
      if (event.lost)
        s.status(
          toServer ? deskNode(event.desk) : "cm.server",
          "retry",
          `Timeout · resend ${event.segment}`,
        );
      return;
    }
    case "segment": {
      const desk = deskOf(event);
      s.hop(tcpLink(desk), {
        kind: "request",
        tone: event.lost ? "failed" : event.attempt > 1 ? "retry" : "neutral",
        reverse: event.from === "server",
      });
      if (event.lost)
        s.status(
          event.from === "server" ? "cm.server" : deskNode(desk),
          "retry",
          `Timeout · resend seq ${event.seq}`,
        );
      return;
    }
    case "ack": {
      const desk = deskOf(event);
      s.hop(tcpLink(desk), {
        kind: "response",
        tone: "success",
        reverse: event.from === "server",
      });
      return;
    }
    case "datagram": {
      const desk = deskOf(event);
      s.hop(udpLink(desk), {
        kind: "event",
        tone: event.lost ? "failed" : "neutral",
        reverse: event.from === "server",
      });
      return;
    }
    case "close":
      s.hop(tcpLink(event.desk), {
        kind: event.segment === "FIN" ? "request" : "response",
        reverse: event.segment === "ACK",
      });
      return;
  }
}

/** The desk on the other end of an event (the server is always the other side). */
function deskOf(event: PacketEvent): DeskId {
  if (event.kind === "handshake" || event.kind === "close") return event.desk;
  const desk = event.from === "server" ? event.to : event.from;
  if (desk === "server")
    throw new Error("A packet between the server and itself");
  return desk;
}

export function compileSend(
  report: DeliveryReport,
  sender: DeskId,
  next: Next,
): CaseRun<MessengerCaption> {
  const s = new CaseScript<MessengerCaption>(
    corporateMessengerGraph,
    "cm-send",
    next,
  );
  const tcp = report.transport === "tcp";
  // The sender's own exchange plays first; each recipient then gets its own branch.
  const own = report.events.filter((event) => deskOf(event) === sender);
  const fanOut = deskIds
    .filter((desk) => desk !== sender)
    .map((desk) => report.events.filter((event) => deskOf(event) === desk));
  const handshake = own.filter((event) => event.kind === "handshake");
  const sending = own.filter((event) => event.kind !== "handshake");

  if (tcp && handshake.length > 0) {
    s.caption("tcpConnect", { desk: deskName(sender) });
    for (const event of handshake) drawEvent(s, event);
    s.status(deskNode(sender), "success", "Connected");
  }
  s.caption(tcp ? "tcpSend" : "udpSend", { parts: report.parts });
  for (const event of sending) drawEvent(s, event);
  if (tcp && report.retransmitted > 0)
    s.caption("tcpLoss", {
      lost: report.lost,
      retransmitted: report.retransmitted,
    });

  const online = deskIds.filter((desk) => report.received[desk] !== undefined);
  s.caption(tcp ? "tcpForward" : "udpForward", {
    online: online.map(deskName).join(", ") || "—",
  });
  s.parallel(
    fanOut.map((events) => (branch) => {
      for (const event of events) drawEvent(branch, event);
    }),
    180,
  );
  for (const desk of online) {
    const parts = report.received[desk] ?? [];
    s.status(
      deskNode(desk),
      isComplete(parts, report.parts) ? "success" : "failed",
      `${parts.length}/${report.parts} · ${parts.join(",") || "—"}`,
    );
  }
  if (tcp && report.offline.length > 0)
    s.caption("tcpOffline", {
      offline: report.offline.map(deskName).join(", "),
    });

  const complete = online.filter((desk) =>
    isComplete(report.received[desk] ?? [], report.parts),
  ).length;
  s.caption(tcp ? "tcpDone" : "udpDone", {
    parts: report.parts,
    sent: report.sent,
    lost: report.lost,
    complete,
    recipients: online.length,
  });
  return s.build();
}

export function compileConnect(
  events: readonly PacketEvent[],
  desk: DeskId,
  next: Next,
): CaseRun<MessengerCaption> {
  const s = new CaseScript<MessengerCaption>(
    corporateMessengerGraph,
    "cm-connect",
    next,
  );
  s.caption("tcpConnect", { desk: deskName(desk) });
  for (const event of events) drawEvent(s, event);
  s.status(deskNode(desk), "success", "Connected");
  return s.build();
}

export function compileClose(
  events: readonly PacketEvent[],
  desk: DeskId,
  next: Next,
): CaseRun<MessengerCaption> {
  const s = new CaseScript<MessengerCaption>(
    corporateMessengerGraph,
    "cm-close",
    next,
  );
  s.caption("close", { desk: deskName(desk) });
  for (const event of events) drawEvent(s, event);
  s.status(deskNode(desk), "queued", "Disconnected");
  return s.build();
}

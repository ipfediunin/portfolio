import type { LinkSpec } from "../../model/graph";
import { worldGraphSchema, type WorldGraph } from "../../model/graph";
import { building, centre, roadTraffic, viaLane } from "../layout";
import { deskIds, type DeskId } from "./model";

const server = building(
  "cm.server",
  "service",
  "Chat Server",
  "Python sockets",
  { x: 7.4, y: 6.4 },
  1.9,
  120,
  8,
);
const desks = {
  "desk-1": building(
    "cm.desk-1",
    "client",
    "Desk 1",
    "TCP / UDP client",
    { x: 2.6, y: 2.2 },
    1.4,
    22,
  ),
  "desk-2": building(
    "cm.desk-2",
    "client",
    "Desk 2",
    "TCP / UDP client",
    { x: 10.0, y: 2.0 },
    1.4,
    22,
  ),
  "desk-3": building(
    "cm.desk-3",
    "client",
    "Desk 3",
    "TCP / UDP client",
    { x: 2.4, y: 7.6 },
    1.4,
    22,
  ),
  "desk-4": building(
    "cm.desk-4",
    "client",
    "Desk 4",
    "TCP / UDP client",
    { x: 11.4, y: 8.8 },
    1.4,
    22,
  ),
} as const satisfies Record<DeskId, unknown>;

/** TCP runs along the streets: an established connection with a fixed path to the server. */
const tcpRoutes: Readonly<Record<DeskId, LinkSpec["route"]>> = {
  "desk-1": viaLane(centre(desks["desk-1"]), { x: 8.1, y: 7.35 }, "x", 4.35),
  "desk-2": viaLane({ x: 10.5, y: 2.7 }, { x: 9.0, y: 6.9 }, "y", 10.5),
  "desk-3": [
    { x: centre(desks["desk-3"]).x, y: 7.9 },
    { x: centre(server).x, y: 7.9 },
  ],
  "desk-4": viaLane(centre(desks["desk-4"]), { x: 8.8, y: 7.7 }, "x", 7.7),
};

export const tcpLink = (desk: DeskId) => `cm.l.tcp-${desk}`;
export const udpLink = (desk: DeskId) => `cm.l.udp-${desk}`;
export const deskNode = (desk: DeskId) => desks[desk].id;

/**
 * Case 04 — a corporate messenger on Python sockets: four desks around the chat server. Each desk
 * has a TCP connection along the streets and sends UDP datagrams that fly straight to the server.
 */
export const corporateMessengerGraph: WorldGraph = worldGraphSchema.parse({
  size: { width: 14, height: 11 },
  nameTags: true,
  views: {
    system: { area: { x0: 0.5, y0: 0.8, x1: 13.6, y1: 10.6 } },
  },
  roads: [
    { id: "cm.r.h", axis: "x", line: 5, from: -12, to: 26 },
    { id: "cm.r.v", axis: "y", line: 6, from: -12, to: 23 },
  ],
  nodes: [server, ...deskIds.map((desk) => desks[desk])],
  links: deskIds.flatMap((desk) => [
    {
      id: tcpLink(desk),
      from: desks[desk].id,
      to: server.id,
      protocol: "tcp",
      flow: "sync",
      route: tcpRoutes[desk],
    },
    {
      id: udpLink(desk),
      from: desks[desk].id,
      to: server.id,
      protocol: "udp",
      flow: "async",
      shape: "arc",
      quiet: true,
      route: [centre(desks[desk]), centre(server)],
    },
  ]),
  vehicleRoutes: [
    ...roadTraffic("cm.v.h", "x", 5, [-9, 23], [2, 2]),
    ...roadTraffic("cm.v.v", "y", 6, [-9, 20], [2, 1]),
  ],
  statusCycles: [
    {
      node: server.id,
      states: [
        { status: "success", text: "2 connections", durationMs: 4000 },
        { status: "processing", text: "Broadcasting", durationMs: 3000 },
      ],
    },
  ],
});

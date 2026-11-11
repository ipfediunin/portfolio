import { worldGraphSchema, type WorldGraph } from "../../model/graph";
import { building, centre, roadTraffic } from "../layout";

const browser = building(
  "wa.browser",
  "client",
  "Browser",
  "React / Next.js",
  { x: 1.0, y: 7.2 },
  1.5,
  26,
);
const next = building(
  "wa.next",
  "service",
  "Next.js",
  "Server",
  { x: 3.5, y: 6.8 },
  1.8,
  96,
  6,
);
const api = building(
  "wa.api",
  "service",
  "Backend API",
  "Python",
  { x: 8.0, y: 7.0 },
  1.8,
  124,
  8,
);
const domain = building(
  "wa.domain",
  "worker",
  "Business logic",
  "Python",
  { x: 8.1, y: 1.1 },
  1.6,
  78,
  5,
);
const database = building(
  "wa.db",
  "database",
  "PostgreSQL",
  "Transactions",
  { x: 10.7, y: 1.3 },
  1.7,
  64,
);

/**
 * Case 06 — the full path of a user action in a web application: the browser, the Next.js server,
 * the Python backend, the business rules and PostgreSQL, and the response back to the interface.
 */
export const webApplicationsGraph: WorldGraph = worldGraphSchema.parse({
  size: { width: 13, height: 11 },
  nameTags: true,
  views: {
    system: { area: { x0: 0.4, y0: 0.6, x1: 12.6, y1: 10.2 } },
  },
  roads: [
    { id: "wa.r.h", axis: "x", line: 5, from: -12, to: 25 },
    { id: "wa.r.v", axis: "y", line: 6, from: -12, to: 23 },
  ],
  nodes: [browser, next, api, domain, database],
  links: [
    {
      id: "wa.l.browser-next",
      from: browser.id,
      to: next.id,
      protocol: "http",
      flow: "sync",
      route: [centre(browser), { x: centre(next).x, y: centre(browser).y }],
    },
    {
      id: "wa.l.next-api",
      from: next.id,
      to: api.id,
      protocol: "http",
      flow: "sync",
      route: [
        { x: centre(next).x, y: 7.7 },
        { x: centre(api).x, y: 7.7 },
      ],
    },
    {
      id: "wa.l.api-domain",
      from: api.id,
      to: domain.id,
      protocol: "http",
      flow: "sync",
      route: [
        { x: 8.7, y: 7.4 },
        { x: 8.7, y: centre(domain).y },
      ],
    },
    {
      id: "wa.l.domain-db",
      from: domain.id,
      to: database.id,
      protocol: "sql",
      flow: "sync",
      route: [
        { x: centre(domain).x, y: 2.0 },
        { x: centre(database).x, y: 2.0 },
      ],
    },
  ],
  vehicleRoutes: [
    ...roadTraffic("wa.v.h", "x", 5, [-9, 22], [2, 2]),
    ...roadTraffic("wa.v.v", "y", 6, [-9, 20], [2, 1]),
  ],
  statusCycles: [
    {
      node: api.id,
      states: [
        { status: "success", text: "201 Created", durationMs: 4200 },
        { status: "processing", text: "POST /bookings", durationMs: 2800 },
      ],
    },
  ],
});

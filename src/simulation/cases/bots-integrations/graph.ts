import { worldGraphSchema, type WorldGraph } from "../../model/graph";
import { building, centre, roadTraffic } from "../layout";

const user = building(
  "bi.user",
  "client",
  "Messenger",
  "Chat app",
  { x: 1.0, y: 1.2 },
  1.4,
  22,
);
const platform = building(
  "bi.platform",
  "gateway",
  "Bot API",
  "Webhook",
  { x: 3.5, y: 1.0 },
  1.6,
  76,
  5,
);
const flask = building(
  "bi.flask",
  "service",
  "Bot backend",
  "Flask",
  { x: 3.5, y: 6.8 },
  1.8,
  110,
  7,
);
const redis = building(
  "bi.redis",
  "cache",
  "Redis",
  "Dialog state",
  { x: 1.0, y: 7.4 },
  1.4,
  30,
);
const postgres = building(
  "bi.postgres",
  "database",
  "PostgreSQL",
  "Reports",
  { x: 8.0, y: 7.0 },
  1.7,
  60,
);
const external = building(
  "bi.external",
  "integration",
  "External API",
  "REST",
  { x: 8.2, y: 1.2 },
  1.5,
  46,
);
const llm = building(
  "bi.llm",
  "integration",
  "LLM API",
  "LLM",
  { x: 10.8, y: 1.6 },
  1.4,
  46,
);

/**
 * Case 08 — a bot as a system: the messenger delivers updates to a Flask webhook, the dialog state
 * lives in Redis, results go to PostgreSQL, data comes from an external API and free text from an
 * LLM, both over the internet (arcs).
 */
export const botsIntegrationsGraph: WorldGraph = worldGraphSchema.parse({
  size: { width: 14, height: 11 },
  nameTags: true,
  views: {
    system: { area: { x0: 0.4, y0: 0.5, x1: 13.0, y1: 10.0 } },
  },
  roads: [
    { id: "bi.r.h", axis: "x", line: 5, from: -12, to: 26 },
    { id: "bi.r.v", axis: "y", line: 6, from: -12, to: 23 },
  ],
  nodes: [user, platform, flask, redis, postgres, external, llm],
  links: [
    {
      id: "bi.l.user-platform",
      from: user.id,
      to: platform.id,
      protocol: "http",
      flow: "sync",
      route: [centre(user), { x: centre(platform).x, y: centre(user).y }],
    },
    {
      id: "bi.l.platform-flask",
      from: platform.id,
      to: flask.id,
      protocol: "webhook",
      flow: "sync",
      route: [
        { x: 4.3, y: 2.4 },
        { x: 4.3, y: 7.2 },
      ],
    },
    {
      id: "bi.l.flask-redis",
      from: flask.id,
      to: redis.id,
      protocol: "resp",
      flow: "sync",
      route: [
        { x: 4.0, y: 8.1 },
        { x: centre(redis).x, y: 8.1 },
      ],
    },
    {
      id: "bi.l.flask-postgres",
      from: flask.id,
      to: postgres.id,
      protocol: "sql",
      flow: "sync",
      route: [
        { x: 4.4, y: 7.6 },
        { x: centre(postgres).x, y: 7.6 },
      ],
    },
    {
      id: "bi.l.flask-external",
      from: flask.id,
      to: external.id,
      protocol: "http",
      flow: "sync",
      shape: "arc",
      route: [centre(flask), centre(external)],
    },
    {
      id: "bi.l.flask-llm",
      from: flask.id,
      to: llm.id,
      protocol: "http",
      flow: "sync",
      shape: "arc",
      route: [centre(flask), centre(llm)],
    },
  ],
  vehicleRoutes: [
    ...roadTraffic("bi.v.h", "x", 5, [-9, 23], [2, 2]),
    ...roadTraffic("bi.v.v", "y", 6, [-9, 20], [2, 1]),
  ],
  statusCycles: [
    {
      node: redis.id,
      states: [
        { status: "cached", text: "state: idle", durationMs: 3600 },
        { status: "processing", text: "state: report:date", durationMs: 3200 },
      ],
    },
    {
      node: flask.id,
      states: [{ status: "success", text: "200 OK", durationMs: 8000 }],
    },
  ],
});

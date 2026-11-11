import { worldGraphSchema, type WorldGraph } from "../../model/graph";
import { building, centre, roadTraffic, viaLane } from "../layout";

const externalApi = building(
  "pa.api",
  "integration",
  "External API",
  "REST",
  { x: 0.9, y: 0.9 },
  1.5,
  46,
);
const webhooks = building(
  "pa.hooks",
  "integration",
  "Webhooks",
  "HTTP",
  { x: 3.5, y: 1.4 },
  1.4,
  40,
);
const django = building(
  "pa.django",
  "service",
  "Django API",
  "Django",
  { x: 3.4, y: 6.8 },
  1.9,
  118,
  8,
);
const monitoring = building(
  "pa.monitor",
  "observability",
  "Monitoring",
  "Django",
  { x: 0.9, y: 7.6 },
  1.5,
  52,
);
const rabbit = building(
  "pa.rabbit",
  "broker",
  "RabbitMQ",
  "Task queue",
  { x: 8.0, y: 7.0 },
  1.6,
  70,
);
const worker = building(
  "pa.worker",
  "worker",
  "Worker",
  "Python",
  { x: 8.0, y: 1.0 },
  1.6,
  80,
  5,
);
const database = building(
  "pa.db",
  "database",
  "Database",
  "SQL",
  { x: 10.7, y: 1.2 },
  1.7,
  60,
);
const notifier = building(
  "pa.notify",
  "integration",
  "Notifications",
  "HTTP",
  { x: 10.8, y: 7.4 },
  1.5,
  44,
);

/**
 * Case 03 — business process automation: data arrives from an external API and webhooks, the
 * Django API validates it and queues tasks in RabbitMQ, a worker processes, stores and notifies;
 * monitoring sees every rejection and every failed task.
 */
export const processAutomationGraph: WorldGraph = worldGraphSchema.parse({
  size: { width: 14, height: 11 },
  nameTags: true,
  views: {
    system: { area: { x0: 0.3, y0: 0.4, x1: 13.6, y1: 10.4 } },
  },
  roads: [
    { id: "pa.r.h", axis: "x", line: 5, from: -12, to: 26 },
    { id: "pa.r.v", axis: "y", line: 6, from: -12, to: 23 },
  ],
  nodes: [
    externalApi,
    webhooks,
    django,
    monitoring,
    rabbit,
    worker,
    database,
    notifier,
  ],
  links: [
    {
      id: "pa.l.api-django",
      from: externalApi.id,
      to: django.id,
      protocol: "http",
      flow: "sync",
      route: viaLane(centre(externalApi), { x: 4.0, y: 7.75 }, "x", 4.4),
    },
    {
      id: "pa.l.hooks-django",
      from: webhooks.id,
      to: django.id,
      protocol: "webhook",
      flow: "sync",
      route: [
        { x: 4.6, y: centre(webhooks).y },
        { x: 4.6, y: 7.5 },
      ],
    },
    {
      id: "pa.l.django-rabbit",
      from: django.id,
      to: rabbit.id,
      protocol: "amqp",
      flow: "async",
      route: [
        { x: centre(django).x, y: 7.6 },
        { x: centre(rabbit).x, y: 7.6 },
      ],
    },
    {
      id: "pa.l.django-monitor",
      from: django.id,
      to: monitoring.id,
      protocol: "http",
      flow: "async",
      route: [
        { x: centre(django).x, y: 8.3 },
        { x: centre(monitoring).x, y: 8.3 },
      ],
    },
    {
      id: "pa.l.rabbit-worker",
      from: rabbit.id,
      to: worker.id,
      protocol: "amqp",
      flow: "async",
      route: [
        { x: 8.6, y: centre(rabbit).y },
        { x: 8.6, y: centre(worker).y },
      ],
    },
    {
      id: "pa.l.worker-db",
      from: worker.id,
      to: database.id,
      protocol: "sql",
      flow: "async",
      route: [
        { x: centre(worker).x, y: 1.9 },
        { x: centre(database).x, y: 1.9 },
      ],
    },
    {
      id: "pa.l.worker-notify",
      from: worker.id,
      to: notifier.id,
      protocol: "http",
      flow: "async",
      route: viaLane({ x: 9.2, y: 2.4 }, centre(notifier), "x", 6.4),
    },
    {
      id: "pa.l.worker-monitor",
      from: worker.id,
      to: monitoring.id,
      protocol: "http",
      flow: "async",
      quiet: true,
      route: viaLane(
        { x: 8.3, y: 2.2 },
        { x: 1.9, y: centre(monitoring).y },
        "x",
        5.6,
      ),
    },
  ],
  vehicleRoutes: [
    ...roadTraffic("pa.v.h", "x", 5, [-9, 23], [2, 2]),
    ...roadTraffic("pa.v.v", "y", 6, [-9, 20], [2, 1]),
  ],
  statusCycles: [
    {
      node: rabbit.id,
      states: [
        { status: "queued", text: "3 tasks", durationMs: 3000 },
        { status: "processing", text: "Consuming", durationMs: 3000 },
      ],
    },
    {
      node: django.id,
      states: [{ status: "success", text: "202 Accepted", durationMs: 8000 }],
    },
  ],
});

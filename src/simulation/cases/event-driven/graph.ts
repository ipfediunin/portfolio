import {
  worldGraphSchema,
  type LinkSpec,
  type WorldGraph,
} from "../../model/graph";
import { building, centre, roadTraffic, viaLane } from "../layout";
import { PARTITIONS } from "./model";

// RabbitMQ district (left).
const api = building(
  "ed.api",
  "service",
  "Orders API",
  "FastAPI",
  { x: 1.0, y: 7.0 },
  1.8,
  110,
  7,
);
const rabbit = building(
  "ed.rabbit",
  "broker",
  "RabbitMQ",
  "queue: tasks",
  { x: 5.0, y: 7.2 },
  1.7,
  72,
);
const postgres = building(
  "ed.db",
  "database",
  "PostgreSQL",
  "Results",
  { x: 8.6, y: 7.4 },
  1.7,
  60,
);
const workers = [1, 2, 3].map((index) =>
  building(
    `ed.worker-${index}`,
    "worker",
    `Worker ${index}`,
    "consumer",
    { x: 1.6 + (index - 1) * 3, y: 1.4 },
    1.5,
    64,
    4,
  ),
);

// Kafka district (right).
const producer = building(
  "ed.producer",
  "service",
  "Orders Service",
  "Producer",
  { x: 13.0, y: 7.0 },
  1.8,
  104,
  7,
);
const partitions = Array.from({ length: PARTITIONS }, (_, index) =>
  building(
    `ed.p${index}`,
    "broker",
    `Partition ${index}`,
    "topic: orders",
    { x: 16.4 + index * 2.2, y: 7.2 },
    1.5,
    60,
  ),
);
const billing = [1, 2, 3].map((index) =>
  building(
    `ed.billing-${index}`,
    "worker",
    `Billing ${index}`,
    "group: billing",
    { x: 13.2 + (index - 1) * 2.6, y: 1.2 },
    1.5,
    58,
    3,
  ),
);
const analytics = building(
  "ed.analytics",
  "worker",
  "Analytics",
  "group: analytics",
  { x: 21.2, y: 1.2 },
  1.5,
  70,
  4,
);

export const workerNode = (worker: number) => `ed.worker-${worker}`;
export const workerLink = (worker: number) => `ed.l.rabbit-worker-${worker}`;
export const workerDbLink = (worker: number) => `ed.l.worker-${worker}-db`;
export const partitionNode = (partition: number) => `ed.p${partition}`;
export const publishLink = (partition: number) => `ed.l.producer-p${partition}`;
export const billingNode = (consumer: number) => `ed.billing-${consumer + 1}`;
export const consumerLink = (partition: number, consumer: string) =>
  `ed.l.p${partition}-${consumer}`;

const rabbitRoutes: readonly LinkSpec["route"][] = [
  viaLane({ x: 5.3, y: 7.6 }, centre(workers[0]!), "x", 4.2),
  [
    { x: 5.6, y: 7.6 },
    { x: 5.6, y: centre(workers[1]!).y },
  ],
  viaLane({ x: 6.2, y: 7.6 }, centre(workers[2]!), "x", 4.4),
];
const dbRoutes: readonly LinkSpec["route"][] = [
  viaLane({ x: 2.7, y: 2.6 }, { x: 9.6, y: 8.2 }, "x", 4.65),
  viaLane({ x: 5.2, y: 2.6 }, { x: 9.8, y: 8.0 }, "x", 4.8),
  [
    { x: 8.9, y: centre(workers[2]!).y },
    { x: 8.9, y: 7.9 },
  ],
];
const publishLanes = [null, 9.2, 9.6] as const;

const consumers = [...billing, analytics];
const consumerLinks: LinkSpec[] = partitions.flatMap((partition, index) =>
  consumers.map((consumer) => ({
    id: consumerLink(index, consumer.id.replace("ed.", "")),
    from: partition.id,
    to: consumer.id,
    protocol: "kafka" as const,
    flow: "async" as const,
    shape: "road" as const,
    quiet: true,
    route: viaLane(
      { x: centre(partition).x, y: 7.5 },
      { x: centre(consumer).x + (index - 1) * 0.25, y: centre(consumer).y },
      "x",
      4.2 + index * 0.2,
    ),
  })),
);

/**
 * Case 05 — two event-driven systems side by side, never mixed: on the left a RabbitMQ queue with
 * competing workers, on the right a Kafka topic with three partitions and two consumer groups.
 */
export const eventDrivenGraph: WorldGraph = worldGraphSchema.parse({
  size: { width: 24, height: 11 },
  nameTags: true,
  views: {
    system: { area: { x0: 0.3, y0: 0.6, x1: 23.6, y1: 10.4 } },
    rabbitmq: {
      area: { x0: 0.3, y0: 0.6, x1: 11.2, y1: 10.2 },
      nodes: [
        api.id,
        rabbit.id,
        postgres.id,
        ...workers.map((node) => node.id),
      ],
    },
    kafka: {
      area: { x0: 12.0, y0: 0.6, x1: 23.6, y1: 10.4 },
      nodes: [
        producer.id,
        ...partitions.map((node) => node.id),
        ...consumers.map((node) => node.id),
      ],
    },
  },
  roads: [
    { id: "ed.r.h", axis: "x", line: 5, from: -12, to: 36 },
    { id: "ed.r.v", axis: "y", line: 11, from: -12, to: 23 },
  ],
  nodes: [
    api,
    rabbit,
    postgres,
    ...workers,
    producer,
    ...partitions,
    ...consumers,
  ],
  links: [
    {
      id: "ed.l.api-rabbit",
      from: api.id,
      to: rabbit.id,
      protocol: "amqp",
      flow: "async",
      route: [
        { x: centre(api).x, y: 7.95 },
        { x: centre(rabbit).x, y: 7.95 },
      ],
    },
    ...workers.map((worker, index) => ({
      id: workerLink(index + 1),
      from: rabbit.id,
      to: worker.id,
      protocol: "amqp" as const,
      flow: "async" as const,
      route: rabbitRoutes[index]!,
    })),
    ...workers.map((worker, index) => ({
      id: workerDbLink(index + 1),
      from: worker.id,
      to: postgres.id,
      protocol: "sql" as const,
      flow: "async" as const,
      quiet: true,
      route: dbRoutes[index]!,
    })),
    ...partitions.map((partition, index) => {
      const lane = publishLanes[index];
      return {
        id: publishLink(index),
        from: producer.id,
        to: partition.id,
        protocol: "kafka" as const,
        flow: "async" as const,
        route: lane
          ? viaLane(
              { x: 14.2 + index * 0.25, y: 8.5 },
              { x: centre(partition).x, y: 8.4 },
              "x",
              lane,
            )
          : [
              { x: centre(producer).x, y: 7.7 },
              { x: centre(partition).x, y: 7.7 },
            ],
      };
    }),
    ...consumerLinks,
  ],
  vehicleRoutes: [
    ...roadTraffic("ed.v.h", "x", 5, [-9, 33], [3, 2]),
    ...roadTraffic("ed.v.v", "y", 11, [-9, 20], [1, 2]),
  ],
  statusCycles: [
    {
      node: rabbit.id,
      states: [
        { status: "queued", text: "Ready: 4", durationMs: 3200 },
        { status: "processing", text: "Unacked: 2", durationMs: 3200 },
      ],
    },
    {
      node: partitions[1]!.id,
      states: [{ status: "success", text: "offset 128", durationMs: 8000 }],
    },
  ],
});

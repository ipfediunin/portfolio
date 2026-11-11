import { z } from "zod";

/**
 * The system graph is the single source of truth for the city: which components exist,
 * where they stand, how they are connected and where traffic drives.
 * Coordinates are in tile space (see src/engine/iso/projection.ts).
 */

export const nodeKinds = [
  "client",
  "gateway",
  "service",
  "cache",
  "database",
  "broker",
  "worker",
  "scheduler",
  "wsHub",
  "storage",
  "integration",
  "observability",
  "dlq",
  "ci",
] as const;

/**
 * Camera views of the one city: the hero shot, the whole system for the playground, and one
 * district per stack area (same ids as the stack content).
 */
export const sceneViewIds = [
  "hero",
  "system",
  "backend",
  "frontend",
  "automation",
] as const;
export type SceneViewId = (typeof sceneViewIds)[number];

export const protocols = [
  "http",
  "amqp",
  "sql",
  "resp",
  "ws",
  "webhook",
  "tcp",
  "udp",
  "kafka",
] as const;

/** Synchronous request/response paths are cyan, asynchronous messaging is violet. */
export const flowKinds = ["sync", "async"] as const;

export const nodeStatuses = [
  "success",
  "processing",
  "queued",
  "retry",
  "failed",
  "cached",
] as const;

/** Rectangular footprints may differ in width and depth by at most this much: depth sorting relies on it. */
export const MAX_FOOTPRINT_ASPECT_DIFFERENCE = 0.8;
/** Minimal distance between a building and a road edge, so vehicles never sort against a building wall. */
export const MIN_ROAD_CLEARANCE = 0.3;

const idSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/,
    "Expected an id like api.orders",
  );
const tilePointSchema = z.object({ x: z.number(), y: z.number() });

export const nodeSpecSchema = z.object({
  id: idSchema,
  kind: z.enum(nodeKinds),
  label: z.string().trim().min(1),
  /** Technical identifier shown next to the label on the scene, e.g. "FastAPI". */
  tech: z.string().trim().min(1),
  /** Minimal tile corner of the footprint. */
  tile: tilePointSchema,
  footprint: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
  }),
  /** Building height in world pixels. */
  height: z.number().positive(),
  floors: z.number().int().positive().optional(),
});

const tileAreaSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

/** Camera view ids of a world: "system" frames all of it, others are districts or close-ups. */
const viewIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "Expected a view id like system");

export const sceneViewSchema = z.object({
  /** Tile rectangle the camera frames. */
  area: tileAreaSchema,
  /** The district's own components; the rest of the city fades back. Omitted: nothing fades. */
  nodes: z.array(idSchema).min(1).optional(),
});

export const roadSpecSchema = z.object({
  id: idSchema,
  /** "x": the road runs along the x axis and occupies tile row `line`; "y": along y in column `line`. */
  axis: z.enum(["x", "y"]),
  line: z.number().int(),
  from: z.number(),
  to: z.number(),
});

export const linkSpecSchema = z.object({
  id: idSchema,
  from: idSchema,
  to: idSchema,
  protocol: z.enum(protocols),
  flow: z.enum(flowKinds),
  /**
   * "road": an axis-aligned polyline along the streets.
   * "arc": a curve through the air between two points — events, pushes and calls over the internet.
   */
  shape: z.enum(["road", "arc"]).default("road"),
  /**
   * Not drawn at rest: the link shows up only when a run sends something along it, or in focus mode.
   * For paths the scene needs for a story (syncs, webhooks) that would clutter the calm city.
   */
  quiet: z.boolean().default(false),
  /** From the source building to the target building; arcs have exactly two points. */
  route: z.array(tilePointSchema).min(2),
});

export const vehicleRouteSchema = z.object({
  id: idSchema,
  livery: z.enum(["white", "violet"]),
  /** Lane start and end; vehicles drive start → end and re-enter at the start. */
  points: z.array(tilePointSchema).length(2),
  count: z.number().int().positive(),
  /** Tiles per second. */
  speed: z.number().positive(),
  /** Phase of the first vehicle along the lane, 0..1. */
  phase: z.number().min(0).max(1),
});

export const statusCycleSchema = z.object({
  node: idSchema,
  states: z
    .array(
      z.object({
        status: z.enum(nodeStatuses),
        text: z.string().trim().min(1),
        durationMs: z.number().positive(),
      }),
    )
    .min(1),
});

/**
 * Scripted request that travels through consecutive links and back, e.g. client → gateway → API → DB.
 * Hops must chain: each hop starts at the node where the previous one ended.
 */
export const requestJourneySchema = z.object({
  /** Shown on the result card, e.g. "GET /api/orders/42". */
  label: z.string().trim().min(1),
  hops: z
    .array(z.object({ link: idSchema, reverse: z.boolean().default(false) }))
    .min(1),
  /** Node above which the result card appears when the response is back. */
  resultNode: idSchema,
  status: z.string().trim().min(1),
  /** Pause between repetitions. */
  intervalMs: z.number().positive(),
});

const graphShape = {
  size: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  roads: z.array(roadSpecSchema),
  nodes: z.array(nodeSpecSchema).min(1),
  links: z.array(linkSpecSchema),
  vehicleRoutes: z.array(vehicleRouteSchema),
  statusCycles: z.array(statusCycleSchema),
  heroJourney: requestJourneySchema.optional(),
  /** Permanent names above the system's buildings: worlds that exist to explain an architecture. */
  nameTags: z.boolean().default(false),
};

type GraphBody = z.infer<z.ZodObject<typeof graphShape>> & {
  readonly views: Readonly<Record<string, SceneView>>;
};

/** Layout rules every world obeys: ids, references, depth sorting and road clearance. */
function checkLayout(graph: GraphBody, context: z.RefinementCtx): void {
  const issue = (message: string) =>
    context.addIssue({ code: "custom", message });

  const ids = [
    ...graph.nodes,
    ...graph.links,
    ...graph.roads,
    ...graph.vehicleRoutes,
  ].map((item) => item.id);
  for (const id of new Set(
    ids.filter((id, index) => ids.indexOf(id) !== index),
  ))
    issue(`Duplicate id "${id}"`);

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const link of graph.links) {
    if (!nodeIds.has(link.from))
      issue(`Link "${link.id}" starts at unknown node "${link.from}"`);
    if (!nodeIds.has(link.to))
      issue(`Link "${link.id}" ends at unknown node "${link.to}"`);
    if (link.shape === "arc") {
      if (link.route.length !== 2)
        issue(`Arc link "${link.id}" must have exactly two points`);
      continue;
    }
    link.route.slice(1).forEach((point, index) => {
      const previous = link.route[index]!;
      if (point.x !== previous.x && point.y !== previous.y) {
        issue(`Link "${link.id}" segment ${index} is not axis-aligned`);
      }
    });
  }
  for (const [viewId, view] of Object.entries(graph.views)) {
    for (const nodeId of view.nodes ?? []) {
      if (!nodeIds.has(nodeId))
        issue(`View "${viewId}" features unknown node "${nodeId}"`);
    }
  }
  for (const cycle of graph.statusCycles) {
    if (!nodeIds.has(cycle.node))
      issue(`Status cycle targets unknown node "${cycle.node}"`);
  }

  if (graph.heroJourney) {
    const journey = graph.heroJourney;
    const linksById = new Map(graph.links.map((link) => [link.id, link]));
    if (!nodeIds.has(journey.resultNode))
      issue(`Journey result node "${journey.resultNode}" is unknown`);
    let at: string | null = null;
    for (const hop of journey.hops) {
      const link = linksById.get(hop.link);
      if (!link) {
        issue(`Journey uses unknown link "${hop.link}"`);
        break;
      }
      const [start, end] = hop.reverse
        ? [link.to, link.from]
        : [link.from, link.to];
      if (at !== null && start !== at)
        issue(
          `Journey hop "${hop.link}" starts at "${start}", expected "${at}"`,
        );
      at = end;
    }
  }

  const roadRects = graph.roads.map(roadRect);
  graph.nodes.forEach((node, index) => {
    const rect = nodeRect(node);
    const { width, depth } = node.footprint;
    if (Math.abs(width - depth) > MAX_FOOTPRINT_ASPECT_DIFFERENCE) {
      issue(`Node "${node.id}" footprint is too elongated for depth sorting`);
    }
    if (
      rect.x0 < 0 ||
      rect.y0 < 0 ||
      rect.x1 > graph.size.width ||
      rect.y1 > graph.size.height
    ) {
      issue(`Node "${node.id}" is outside the map`);
    }
    if (
      roadRects.some((road) =>
        rectsOverlap(expandRect(rect, MIN_ROAD_CLEARANCE), road),
      )
    ) {
      issue(
        `Node "${node.id}" is closer than ${MIN_ROAD_CLEARANCE} tiles to a road`,
      );
    }
    graph.nodes.slice(index + 1).forEach((other) => {
      if (rectsOverlap(rect, nodeRect(other)))
        issue(`Nodes "${node.id}" and "${other.id}" overlap`);
    });
  });
}

/** The city: one world with the hero shot, the whole system and one district per stack area. */
export const systemGraphSchema = z
  .object({
    ...graphShape,
    views: z.object({
      hero: sceneViewSchema,
      system: sceneViewSchema,
      backend: sceneViewSchema,
      frontend: sceneViewSchema,
      automation: sceneViewSchema,
    } satisfies Record<SceneViewId, typeof sceneViewSchema>),
  })
  .superRefine(checkLayout);

/**
 * Any world the engine can render: the city or a case study's own small system. "system" frames
 * the whole world (and keeps background buildings out of it); a world may add its own districts.
 */
export const worldGraphSchema = z
  .object({
    ...graphShape,
    views: z
      .object({ system: sceneViewSchema })
      .catchall(sceneViewSchema)
      .refine(
        (views) =>
          Object.keys(views).every((id) => viewIdSchema.safeParse(id).success),
        "View ids must look like system",
      ),
  })
  .superRefine(checkLayout);

export type SystemGraph = z.infer<typeof systemGraphSchema>;
export type WorldGraph = z.infer<typeof worldGraphSchema>;
export type NodeSpec = z.infer<typeof nodeSpecSchema>;
export type NodeKind = NodeSpec["kind"];
export type RoadSpec = z.infer<typeof roadSpecSchema>;
export type LinkSpec = z.infer<typeof linkSpecSchema>;
export type FlowKind = LinkSpec["flow"];
export type VehicleRoute = z.infer<typeof vehicleRouteSchema>;
export type StatusCycle = z.infer<typeof statusCycleSchema>;
export type RequestJourney = z.infer<typeof requestJourneySchema>;
export type NodeStatus = StatusCycle["states"][number]["status"];
export type TilePoint = z.infer<typeof tilePointSchema>;
export type SceneView = z.infer<typeof sceneViewSchema>;

export interface TileRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Length of a link in tiles along its route; an arc is longer than its chord. */
export function linkLengthTiles(link: LinkSpec): number {
  let length = 0;
  for (let index = 1; index < link.route.length; index++) {
    const from = link.route[index - 1]!;
    const to = link.route[index]!;
    length += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return link.shape === "arc" ? length * 1.25 : length;
}

export function nodeRect(node: NodeSpec): TileRect {
  return {
    x0: node.tile.x,
    y0: node.tile.y,
    x1: node.tile.x + node.footprint.width,
    y1: node.tile.y + node.footprint.depth,
  };
}

export function nodeCenter(node: NodeSpec): TilePoint {
  return {
    x: node.tile.x + node.footprint.width / 2,
    y: node.tile.y + node.footprint.depth / 2,
  };
}

export function roadRect(road: RoadSpec): TileRect {
  return road.axis === "x"
    ? { x0: road.from, y0: road.line, x1: road.to, y1: road.line + 1 }
    : { x0: road.line, y0: road.from, x1: road.line + 1, y1: road.to };
}

export function expandRect(rect: TileRect, amount: number): TileRect {
  return {
    x0: rect.x0 - amount,
    y0: rect.y0 - amount,
    x1: rect.x1 + amount,
    y1: rect.y1 + amount,
  };
}

/** Strict overlap: rectangles that only touch do not overlap. */
export function rectsOverlap(a: TileRect, b: TileRect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

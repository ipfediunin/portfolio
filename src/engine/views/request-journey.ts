import { GraphicsContext, Point, type Container, type Texture } from "pixi.js";

import {
  nodeCenter,
  type RequestJourney,
  type WorldGraph,
} from "@/simulation/model/graph";
import { SeededRng } from "@/simulation/runtime/seeded-rng";

import { PLATE_HEIGHT } from "../factories/buildings";
import { tileToWorld } from "../iso/projection";
import type { BakedArt, TextureBaker } from "../rendering/texture-baker";
import type { SceneTheme } from "../theme/scene-theme";
import {
  planJourneyPath,
  reverseJourneyPath,
  type JourneyPath,
} from "../world/journey-path";
import { PolylinePath, type PathSample } from "../world/polyline-path";
import { PACKET_ART_SCALE, packetContext, PulsePool } from "./packet-art";
import { StatusCard } from "./status-card";

const SPEED = 560;
const FIRST_DELAY_MS = 2400;
const PROCESSING_MS = 520;
const RESULT_MS = 3400;
const TRAIL_GAP = 20;
const TRAIL_LENGTH = 4;
/** Above the roof, like the ambient status cards. */
const CARD_LIFT = 5 + 16;

type Phase = "waiting" | "request" | "processing" | "response" | "result";

interface Leg {
  readonly plan: JourneyPath;
  readonly path: PolylinePath;
}

export interface RequestJourneyView {
  readonly card: StatusCard;
  /** World point the card hangs from. */
  readonly cardAnchor: Point;
  update(deltaMs: number): void;
  /** Off while the playground drives the city; on again restarts the story from the beginning. */
  setActive(active: boolean): void;
  destroy(): void;
}

/**
 * First-visit choreography: one request leaves the client, passes the gateway and the API,
 * reaches the database and comes back; every node it touches pulses, and a result card with the
 * latency appears at the end. Repeats with a pause so the city keeps telling the same story.
 */
export function createRequestJourney(
  graph: WorldGraph,
  journey: RequestJourney,
  theme: SceneTheme,
  layers: {
    /** Ground level, under buildings: arrival rings around building bases. */
    readonly ground: Container;
    /** Above buildings: the highlighted packet must stay visible behind towers. */
    readonly highlight: Container;
  },
  baker: TextureBaker,
  shadowTexture: Texture,
): RequestJourneyView {
  const { colors } = theme;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const firstLink = graph.links.find(
    (link) => link.id === journey.hops[0]?.link,
  );
  const originId = journey.hops[0]?.reverse ? firstLink?.to : firstLink?.from;
  const resultNode = nodesById.get(journey.resultNode);
  if (!originId || !resultNode)
    throw new Error("Hero journey references unknown nodes");

  const outboundPlan = planJourneyPath(graph, journey);
  const inboundPlan = reverseJourneyPath(outboundPlan, originId);
  const legs: Record<"request" | "response", Leg> = {
    request: {
      plan: outboundPlan,
      path: new PolylinePath(outboundPlan.points),
    },
    response: { plan: inboundPlan, path: new PolylinePath(inboundPlan.points) },
  };

  const contexts = {
    request: packetContext(colors.flowSync),
    response: packetContext(colors.statusSuccess),
    trail: new GraphicsContext().circle(0, 0, 6.5).fill("#ffffff"),
  };
  const arts: Record<keyof typeof contexts, BakedArt> = {
    request: baker.fromContext(contexts.request),
    response: baker.fromContext(contexts.response),
    trail: baker.fromContext(contexts.trail),
  };
  const pulses = new PulsePool(baker, layers.ground, 3);

  const head = arts.request.createSprite();
  head.scale.set(1 / PACKET_ART_SCALE);
  const trail = Array.from({ length: TRAIL_LENGTH }, (_, index) => {
    const sprite = arts.trail.createSprite();
    sprite.alpha = 0.55 * (1 - index / TRAIL_LENGTH);
    sprite.scale.set(1 - index * 0.16);
    return sprite;
  });
  layers.highlight.addChild(...trail, head);

  const card = new StatusCard(theme, shadowTexture, journey.label);
  card.setState("success", journey.status);
  const resultCenter = nodeCenter(resultNode);
  const resultWorld = tileToWorld(resultCenter.x, resultCenter.y);
  const cardAnchor = new Point(
    resultWorld.x,
    resultWorld.y - PLATE_HEIGHT - resultNode.height - CARD_LIFT,
  );

  const rng = new SeededRng(42);
  const sample: PathSample = { x: 0, y: 0, directionX: 1, directionY: 0 };
  let active = true;
  let phase: Phase = "waiting";
  let timer = FIRST_DELAY_MS;
  let distance = 0;
  let nextArrival = 0;

  function setPacketVisible(visible: boolean): void {
    head.visible = visible;
    for (const sprite of trail) sprite.visible = visible;
  }
  setPacketVisible(false);

  function placePacket(leg: Leg): void {
    leg.path.sampleAt(distance, sample);
    head.position.set(sample.x, sample.y);
    trail.forEach((sprite, index) => {
      leg.path.pointAt(
        Math.max(0, distance - (index + 1) * TRAIL_GAP),
        sprite.position,
      );
    });
  }

  function tintFor(kind: "request" | "response"): string {
    return kind === "request" ? colors.flowSync : colors.statusSuccess;
  }

  function startLeg(kind: "request" | "response"): void {
    phase = kind;
    distance = 0;
    nextArrival = 0;
    arts[kind].use(head);
    for (const sprite of trail) sprite.tint = tintFor(kind);
    setPacketVisible(true);
    placePacket(legs[kind]);
    const origin = nodesById.get(originId!);
    if (kind === "request" && origin) pulses.start(origin, colors.flowSync);
  }

  function advanceLeg(kind: "request" | "response", deltaMs: number): boolean {
    const leg = legs[kind];
    distance = Math.min(leg.plan.length, distance + (SPEED * deltaMs) / 1000);
    placePacket(leg);
    while (
      nextArrival < leg.plan.arrivals.length &&
      distance >= leg.plan.arrivals[nextArrival]!.distance
    ) {
      const node = nodesById.get(leg.plan.arrivals[nextArrival]!.nodeId);
      if (node) pulses.start(node, tintFor(kind));
      nextArrival++;
    }
    return distance >= leg.plan.length;
  }

  return {
    card,
    cardAnchor,
    update(deltaMs) {
      pulses.update(deltaMs);
      card.update(deltaMs);
      if (!active) return;

      switch (phase) {
        case "waiting":
          timer -= deltaMs;
          if (timer <= 0) startLeg("request");
          break;
        case "request":
          if (advanceLeg("request", deltaMs)) {
            phase = "processing";
            timer = PROCESSING_MS;
            setPacketVisible(false);
          }
          break;
        case "processing":
          timer -= deltaMs;
          if (timer <= 0) startLeg("response");
          break;
        case "response":
          if (advanceLeg("response", deltaMs)) {
            setPacketVisible(false);
            const latency = Math.round(rng.range(28, 64));
            card.setState("success", `${journey.status} · ${latency} ms`);
            card.show(false);
            phase = "result";
            timer = RESULT_MS;
          }
          break;
        case "result":
          timer -= deltaMs;
          if (timer <= 0) {
            card.hide();
            phase = "waiting";
            timer = journey.intervalMs;
          }
          break;
      }
    },
    setActive(next) {
      if (next === active) return;
      active = next;
      setPacketVisible(false);
      phase = "waiting";
      timer = FIRST_DELAY_MS;
      if (!next) card.hide();
    },
    destroy() {
      card.destroy();
      head.destroy();
      for (const sprite of trail) sprite.destroy();
      pulses.destroy();
      for (const context of Object.values(contexts)) context.destroy();
    },
  };
}

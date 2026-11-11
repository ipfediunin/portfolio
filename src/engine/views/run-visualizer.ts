import {
  Point,
  Sprite,
  type Container,
  type GraphicsContext,
  type Texture,
} from "pixi.js";

import type {
  PacketHop,
  PacketKind,
  PacketTone,
  SimEvent,
} from "@/simulation/model/events";
import {
  nodeCenter,
  type NodeSpec,
  type WorldGraph,
} from "@/simulation/model/graph";

import { PLATE_HEIGHT } from "../factories/buildings";
import { tileToWorld } from "../iso/projection";
import type { BakedArt, TextureBaker } from "../rendering/texture-baker";
import type { SceneColors, SceneTheme } from "../theme/scene-theme";
import type { PlayerHandle } from "../types";
import type { LinkPath } from "../world/link-paths";
import type { PolylinePath } from "../world/polyline-path";
import {
  crateContext,
  PACKET_ART_SCALE,
  packetContext,
  PulsePool,
} from "./packet-art";
import { StatusCard } from "./status-card";

/** How long a node keeps its status card, in playback time. */
const STATUS_HOLD_MS = 2600;
const CARD_LIFT = 5 + 16;
const EVENT_SCALE = 0.75;
/**
 * When the camera frames the whole system small (phones), packets keep at least this share of their
 * base size on screen, growing up to the full baked art size.
 */
const MIN_PACKET_SCREEN_SCALE = 0.5;

interface ActiveHop {
  readonly hop: PacketHop;
  readonly sprite: Sprite;
  readonly art: BakedArt;
  readonly path: PolylinePath;
  readonly target: NodeSpec | undefined;
  readonly tint: string;
}

export interface NodeCard {
  readonly card: StatusCard;
  readonly anchor: Point;
  shownAt: number;
  visible: boolean;
}

export interface RunVisualizer {
  readonly cards: ReadonlyMap<string, NodeCard>;
  connect(player: PlayerHandle): () => void;
  /** Places packets from the player clock; `deltaMs` drives the purely visual easing (rings, cards). */
  update(deltaMs: number): void;
  /** World-to-screen scale of the camera; packets grow when it is small so they stay easy to follow. */
  setViewScale(scale: number): void;
  clear(): void;
  destroy(): void;
}

function packetColor(
  colors: SceneColors,
  kind: PacketKind,
  tone: PacketTone,
): string {
  if (tone === "failed") return colors.statusFailed;
  if (tone === "retry") return colors.statusRetry;
  if (tone === "success")
    return kind === "event" ? colors.flowAsync : colors.statusSuccess;
  return kind === "job" || kind === "event"
    ? colors.flowAsync
    : colors.flowSync;
}

/**
 * Draws playground runs: every `packet.hop` from the player becomes a packet moving along its link,
 * positioned purely from the player's clock so pause, speed and stepping need no special handling.
 */
export function createRunVisualizer(options: {
  readonly graph: WorldGraph;
  readonly theme: SceneTheme;
  readonly baker: TextureBaker;
  readonly linkPaths: ReadonlyMap<string, LinkPath>;
  readonly layers: {
    readonly ground: Container;
    readonly highlight: Container;
  };
  readonly overlay: Container;
  readonly shadowTexture: Texture;
}): RunVisualizer {
  const { graph, theme, baker, linkPaths, layers, overlay, shadowTexture } =
    options;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const contexts: GraphicsContext[] = [];
  const arts = new Map<string, BakedArt>();
  const pulses = new PulsePool(baker, layers.ground, 6);
  const freeSprites: Sprite[] = [];
  const active: ActiveHop[] = [];
  const cards = new Map<string, NodeCard>();
  let player: PlayerHandle | null = null;
  let packetZoom = 1;

  function packetScale(kind: PacketKind): number {
    return (
      (packetZoom / PACKET_ART_SCALE) * (kind === "event" ? EVENT_SCALE : 1)
    );
  }

  function artFor(kind: PacketKind, tone: PacketTone): BakedArt {
    const color = packetColor(theme.colors, kind, tone);
    const shape = kind === "job" ? "crate" : "packet";
    const key = `${shape}:${color}`;
    let art = arts.get(key);
    if (!art) {
      const context =
        shape === "crate" ? crateContext(color) : packetContext(color);
      contexts.push(context);
      art = baker.fromContext(context);
      arts.set(key, art);
    }
    return art;
  }

  function cardFor(node: NodeSpec): NodeCard {
    let entry = cards.get(node.id);
    if (!entry) {
      const center = nodeCenter(node);
      const world = tileToWorld(center.x, center.y);
      const card = new StatusCard(theme, shadowTexture, node.label);
      overlay.addChild(card.view);
      entry = {
        card,
        anchor: new Point(
          world.x,
          world.y - PLATE_HEIGHT - node.height - CARD_LIFT,
        ),
        shownAt: 0,
        visible: false,
      };
      cards.set(node.id, entry);
    }
    return entry;
  }

  function startHop(hop: PacketHop): void {
    const linkPath = linkPaths.get(hop.linkId);
    if (!linkPath) return;
    const art = artFor(hop.kind, hop.tone);
    const sprite = freeSprites.pop() ?? new Sprite();
    art.use(sprite);
    sprite.visible = true;
    sprite.scale.set(packetScale(hop.kind));
    if (!sprite.parent) layers.highlight.addChild(sprite);
    const targetId = hop.reverse ? linkPath.link.from : linkPath.link.to;
    active.push({
      hop,
      sprite,
      art,
      path: hop.reverse ? linkPath.backward : linkPath.forward,
      target: nodesById.get(targetId),
      tint: packetColor(theme.colors, hop.kind, hop.tone),
    });
  }

  function finish(index: number): void {
    const [entry] = active.splice(index, 1);
    if (!entry) return;
    entry.art.release(entry.sprite);
    entry.sprite.visible = false;
    freeSprites.push(entry.sprite);
    if (entry.target) pulses.start(entry.target, entry.tint);
  }

  function handle(event: SimEvent): void {
    if (event.type === "packet.hop") {
      startHop(event.hop);
    } else if (event.type === "node.status") {
      const node = nodesById.get(event.nodeId);
      if (!node) return;
      const entry = cardFor(node);
      entry.card.setState(event.status, event.text);
      if (!entry.visible) entry.card.show(false);
      entry.visible = true;
      entry.shownAt = event.at;
    }
  }

  function clear(): void {
    for (let index = active.length - 1; index >= 0; index--) {
      const [entry] = active.splice(index, 1);
      if (!entry) continue;
      entry.art.release(entry.sprite);
      entry.sprite.visible = false;
      freeSprites.push(entry.sprite);
    }
    for (const entry of cards.values()) {
      if (entry.visible) entry.card.hide();
      entry.visible = false;
    }
  }

  return {
    cards,
    connect(next) {
      clear();
      player = next;
      const unsubscribe = next.subscribe(handle);
      return () => {
        unsubscribe();
        if (player === next) player = null;
        clear();
      };
    },
    update(deltaMs) {
      pulses.update(deltaMs);
      for (const entry of cards.values()) entry.card.update(deltaMs);
      if (!player) return;

      const time = player.time;
      for (let index = active.length - 1; index >= 0; index--) {
        const entry = active[index]!;
        const { departAt, arriveAt } = entry.hop;
        if (time >= arriveAt) {
          finish(index);
          continue;
        }
        const progress = Math.max(0, (time - departAt) / (arriveAt - departAt));
        entry.path.pointAt(progress * entry.path.length, entry.sprite.position);
      }
      for (const entry of cards.values()) {
        if (entry.visible && time - entry.shownAt > STATUS_HOLD_MS) {
          entry.card.hide();
          entry.visible = false;
        }
      }
    },
    setViewScale(scale) {
      const zoom = Math.min(
        PACKET_ART_SCALE,
        Math.max(1, MIN_PACKET_SCREEN_SCALE / scale),
      );
      if (zoom === packetZoom) return;
      packetZoom = zoom;
      for (const entry of active)
        entry.sprite.scale.set(packetScale(entry.hop.kind));
    },
    clear,
    destroy() {
      clear();
      for (const sprite of freeSprites) sprite.destroy();
      for (const entry of cards.values()) entry.card.destroy();
      pulses.destroy();
      for (const context of contexts) context.destroy();
    },
  };
}

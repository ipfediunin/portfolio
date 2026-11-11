import { GraphicsContext, type Container, type Sprite } from "pixi.js";

import { nodeCenter, type NodeSpec } from "@/simulation/model/graph";

import { PLATE_HEIGHT } from "../factories/buildings";
import { tileToWorld } from "../iso/projection";
import type { BakedArt, TextureBaker } from "../rendering/texture-baker";

/**
 * Packet art is drawn at twice its base size and shown at half scale, so packets can grow on small
 * screens while the baked texture is only ever scaled down, never blurred up.
 */
export const PACKET_ART_SCALE = 2;

/** Larger and brighter than the ambient pulses: a packet the eye should follow. */
export function packetContext(color: string): GraphicsContext {
  return new GraphicsContext()
    .scale(PACKET_ART_SCALE)
    .circle(0, 0, 26)
    .fill({ color, alpha: 0.14 })
    .circle(0, 0, 16)
    .fill({ color, alpha: 0.3 })
    .circle(0, 0, 9.5)
    .fill(color)
    .circle(0, 0, 4.2)
    .fill("#ffffff");
}

/** Background jobs travel as crates, so a job reads differently from a request at a glance. */
export function crateContext(color: string): GraphicsContext {
  return new GraphicsContext()
    .scale(PACKET_ART_SCALE)
    .roundRect(-22, -16, 44, 32, 12)
    .fill({ color, alpha: 0.16 })
    .roundRect(-11, -8, 22, 16, 4)
    .fill(color)
    .roundRect(-5, -3, 10, 6, 2)
    .fill("#ffffff");
}

/** Ring art is baked at the size of a 2-tile building, so it is only ever scaled down, never blurred up. */
const RING_RADIUS_X = 150;
const RING_SCALE_PER_TILE = 0.47;
const PULSE_MS = 720;

interface Pulse {
  readonly sprite: Sprite;
  elapsed: number;
  baseScale: number;
}

/** Expanding rings around building bases when a packet arrives; a small reusable pool. */
export class PulsePool {
  private readonly context = new GraphicsContext()
    .ellipse(0, 0, RING_RADIUS_X, RING_RADIUS_X / 2)
    .stroke({ color: "#ffffff", width: 5 });
  private readonly art: BakedArt;
  private readonly pulses: Pulse[];

  constructor(baker: TextureBaker, layer: Container, size = 4) {
    this.art = baker.fromContext(this.context);
    this.pulses = Array.from({ length: size }, () => {
      const sprite = this.art.createSprite();
      sprite.visible = false;
      layer.addChild(sprite);
      return { sprite, elapsed: Number.POSITIVE_INFINITY, baseScale: 1 };
    });
  }

  start(node: NodeSpec, tint: string): void {
    const pulse =
      this.pulses.find((candidate) => candidate.elapsed >= PULSE_MS) ??
      this.oldest();
    if (!pulse) return;
    const center = nodeCenter(node);
    const world = tileToWorld(center.x, center.y);
    pulse.baseScale =
      Math.max(node.footprint.width, node.footprint.depth) *
      RING_SCALE_PER_TILE;
    pulse.sprite.position.set(world.x, world.y - PLATE_HEIGHT);
    pulse.sprite.tint = tint;
    pulse.sprite.scale.set(pulse.baseScale * 0.6);
    pulse.sprite.alpha = 0.85;
    pulse.sprite.visible = true;
    pulse.elapsed = 0;
  }

  update(deltaMs: number): void {
    for (const pulse of this.pulses) {
      if (pulse.elapsed >= PULSE_MS) continue;
      pulse.elapsed += deltaMs;
      const t = Math.min(1, pulse.elapsed / PULSE_MS);
      const eased = 1 - (1 - t) ** 3;
      pulse.sprite.alpha = 0.85 * (1 - t);
      pulse.sprite.scale.set(pulse.baseScale * (0.6 + eased * 0.65));
      if (t >= 1) pulse.sprite.visible = false;
    }
  }

  destroy(): void {
    for (const pulse of this.pulses) pulse.sprite.destroy();
    this.context.destroy();
  }

  private oldest(): Pulse | undefined {
    return this.pulses.reduce<Pulse | undefined>(
      (oldest, pulse) =>
        !oldest || pulse.elapsed > oldest.elapsed ? pulse : oldest,
      undefined,
    );
  }
}

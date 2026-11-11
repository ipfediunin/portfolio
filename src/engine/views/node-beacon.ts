import { Graphics, type Container } from "pixi.js";

import { nodeRect, type WorldGraph } from "@/simulation/model/graph";

import { tileToWorld } from "../iso/projection";
import type { SceneColors } from "../theme/scene-theme";

/** The ring sits this far (tiles) outside the building's plinth, a little wider than focus. */
const RING_MARGIN = 0.35;
const PULSE_MS = 1800;
/** How far the pulse grows past the ring before it fades out. */
const PULSE_GROWTH = 0.45;
const PULSE_ALPHA = 0.6;

export interface NodeBeacon {
  /** Rings this node (the place the visitor can act from); null removes the ring. */
  set(nodeId: string | null): void;
  update(deltaMs: number): void;
  destroy(): void;
}

/**
 * A soft ring on the ground around one building with a pulse that keeps growing out of it: "you
 * can start here". Unlike focus mode it dims nothing. The rings are drawn once per node; the pulse
 * only changes a transform and an alpha, so nothing is re-tessellated per frame.
 */
export function createNodeBeacon(options: {
  readonly graph: WorldGraph;
  readonly colors: SceneColors;
  readonly layer: Container;
  readonly animated: boolean;
}): NodeBeacon {
  const { graph, colors, layer, animated } = options;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const ring = new Graphics({ label: "beacon-ring" });
  const pulse = new Graphics({ label: "beacon-pulse" });
  layer.addChild(ring, pulse);
  layer.visible = false;
  let phase = 0;

  function apply(): void {
    pulse.scale.set(1 + PULSE_GROWTH * phase);
    pulse.alpha = animated ? PULSE_ALPHA * (1 - phase) : 0;
  }

  return {
    set(nodeId) {
      const node = nodeId ? nodesById.get(nodeId) : undefined;
      ring.clear();
      pulse.clear();
      layer.visible = node !== undefined;
      if (!node) return;
      const rect = nodeRect(node);
      const corners = [
        tileToWorld(rect.x0 - RING_MARGIN, rect.y0 - RING_MARGIN),
        tileToWorld(rect.x1 + RING_MARGIN, rect.y0 - RING_MARGIN),
        tileToWorld(rect.x1 + RING_MARGIN, rect.y1 + RING_MARGIN),
        tileToWorld(rect.x0 - RING_MARGIN, rect.y1 + RING_MARGIN),
      ];
      const centerX = corners.reduce((sum, c) => sum + c.x, 0) / 4;
      const centerY = corners.reduce((sum, c) => sum + c.y, 0) / 4;
      // Drawn around the center, so the pulse can scale out of the ring.
      const points = corners.flatMap((c) => [c.x - centerX, c.y - centerY]);
      ring.position.set(centerX, centerY);
      pulse.position.set(centerX, centerY);
      ring
        .poly(points)
        .fill({ color: colors.glass, alpha: 0.12 })
        .stroke({ color: colors.glass, width: 3, alpha: 0.85 });
      pulse.poly(points).stroke({ color: colors.glass, width: 3, alpha: 1 });
      phase = 0;
      apply();
    },
    update(deltaMs) {
      if (!layer.visible || !animated) return;
      phase = (phase + deltaMs / PULSE_MS) % 1;
      apply();
    },
    destroy() {
      ring.destroy();
      pulse.destroy();
    },
  };
}

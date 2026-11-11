import { Graphics, type Container, type Sprite } from "pixi.js";

import {
  nodeRect,
  type LinkSpec,
  type WorldGraph,
} from "@/simulation/model/graph";

import { tileToWorld } from "../iso/projection";
import type { Traffic } from "../systems/traffic";
import type { SceneColors } from "../theme/scene-theme";
import { linkWorldPoints } from "../world/link-paths";
import { drawGlowLine } from "./flow-network";

/** Everything outside the focus fades to this opacity (the "focus mode" of the concept). */
const DIM_ALPHA = 0.35;
const FADE_MS = 180;
/** The ring sits this far (tiles) outside the building's plinth. */
const RING_MARGIN = 0.3;

export interface FocusTargets {
  /** The system's own buildings, by node id. */
  readonly buildings: ReadonlyMap<string, Sprite>;
  /** Background buildings and trees. */
  readonly scenery: readonly Sprite[];
  /**
   * Faded as a whole: flow lines, arcs and pulses (the highlighted links are redrawn on top) and the
   * ambient status cards, which are about other nodes.
   */
  readonly layers: readonly Container[];
  readonly traffic: Traffic;
}

export interface NodeFocus {
  /**
   * A district: its nodes and the links between them stay at full strength, the rest of the city
   * fades back. null: no district, the whole city at full strength.
   */
  setEmphasis(nodeIds: readonly string[] | null, immediate: boolean): void;
  /**
   * Brings these nodes (with a ground ring), their links and their neighbours forward, on top of any
   * district emphasis; an empty list clears it.
   */
  setFocus(nodeIds: readonly string[], immediate: boolean): void;
  /** Advances the fade; true while it is still running, so an idle scene knows to keep rendering. */
  update(deltaMs: number): boolean;
  destroy(): void;
}

/**
 * Focus mode. The highlight Graphics live in their own render groups (`layers`) and are redrawn
 * only when the focus or the district changes, never per frame.
 */
export function createNodeFocus(options: {
  readonly graph: WorldGraph;
  readonly colors: SceneColors;
  readonly targets: FocusTargets;
  readonly layers: { readonly ground: Container; readonly air: Container };
}): NodeFocus {
  const { graph, colors, targets, layers } = options;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const ground = new Graphics({ label: "focus-ground" });
  const air = new Graphics({ label: "focus-air" });
  layers.ground.addChild(ground);
  layers.air.addChild(air);

  const flowColor = { sync: colors.flowSync, async: colors.flowAsync };
  let emphasis: ReadonlySet<string> | null = null;
  let focused: ReadonlySet<string> = new Set();
  let stateKey = "";
  let bright = new Set<string>();
  let mix = 0;
  let target = 0;

  function known(nodeIds: readonly string[]): Set<string> {
    return new Set(nodeIds.filter((id) => nodesById.has(id)));
  }

  function draw(links: readonly LinkSpec[], ringed: ReadonlySet<string>): void {
    ground.clear();
    air.clear();
    for (const link of links) {
      drawGlowLine(
        link.shape === "arc" ? air : ground,
        linkWorldPoints(link),
        flowColor[link.flow],
      );
    }
    for (const nodeId of ringed) {
      const node = nodesById.get(nodeId);
      if (!node) continue;
      const rect = nodeRect(node);
      const corners = [
        tileToWorld(rect.x0 - RING_MARGIN, rect.y0 - RING_MARGIN),
        tileToWorld(rect.x1 + RING_MARGIN, rect.y0 - RING_MARGIN),
        tileToWorld(rect.x1 + RING_MARGIN, rect.y1 + RING_MARGIN),
        tileToWorld(rect.x0 - RING_MARGIN, rect.y1 + RING_MARGIN),
      ];
      ground
        .poly(corners.flatMap((corner) => [corner.x, corner.y]))
        .fill({ color: colors.glass, alpha: 0.14 })
        .stroke({ color: colors.glass, width: 4, alpha: 0.9 });
    }
  }

  function apply(): void {
    const dim = 1 - (1 - DIM_ALPHA) * mix;
    for (const [nodeId, sprite] of targets.buildings)
      sprite.alpha = bright.has(nodeId) ? 1 : dim;
    for (const sprite of targets.scenery) sprite.alpha = dim;
    for (const layer of targets.layers) layer.alpha = dim;
    targets.traffic.setOpacity(dim);
    ground.alpha = mix;
    air.alpha = mix;
  }

  /** Picks what to show: a node focus beats the district, the district beats the plain city. */
  function resolve(immediate: boolean): void {
    const key =
      focused.size > 0
        ? `focus:${[...focused].sort().join("|")}`
        : emphasis
          ? `district:${[...emphasis].sort().join("|")}`
          : "";
    if (key === stateKey) return;
    stateKey = key;

    if (focused.size > 0) {
      draw(
        graph.links.filter(
          (link) => focused.has(link.from) || focused.has(link.to),
        ),
        focused,
      );
      bright = new Set(focused);
      for (const link of graph.links) {
        if (focused.has(link.from)) bright.add(link.to);
        if (focused.has(link.to)) bright.add(link.from);
      }
      target = 1;
    } else if (emphasis) {
      const district = emphasis;
      draw(
        // Quiet links stay hidden in a district at rest; runs and hovers show them.
        graph.links.filter(
          (link) =>
            !link.quiet && district.has(link.from) && district.has(link.to),
        ),
        new Set(),
      );
      bright = new Set(district);
      target = 1;
    } else {
      // Keep the last highlight while it fades out; `update` clears it at the end.
      target = 0;
    }
    if (immediate) mix = target;
    apply();
    if (mix === 0) {
      ground.clear();
      air.clear();
    }
  }

  return {
    setEmphasis(nodeIds, immediate) {
      emphasis = nodeIds ? known(nodeIds) : null;
      resolve(immediate);
    },
    setFocus(nodeIds, immediate) {
      focused = known(nodeIds);
      resolve(immediate);
    },
    update(deltaMs) {
      if (mix === target) return false;
      const step = deltaMs / FADE_MS;
      mix =
        target > mix
          ? Math.min(target, mix + step)
          : Math.max(target, mix - step);
      apply();
      if (mix === 0) {
        ground.clear();
        air.clear();
      }
      return true;
    },
    destroy() {
      ground.destroy();
      air.destroy();
    },
  };
}

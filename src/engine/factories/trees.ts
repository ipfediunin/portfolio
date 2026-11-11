import { GraphicsContext } from "pixi.js";

import { mixHex } from "../theme/color";
import type { SceneColors } from "../theme/scene-theme";

/** Crown radii in world pixels; trees pick one of these shared shapes. */
export const TREE_SIZES = [9, 12, 15] as const;

/**
 * One shared geometry per tree size: every tree is a cheap Graphics view over it.
 * Origin is the ground point under the crown.
 */
export function createTreeContexts(colors: SceneColors): GraphicsContext[] {
  return TREE_SIZES.map((radius) => {
    const context = new GraphicsContext();
    context
      .ellipse(radius * 0.45, 0, radius * 1.05, radius * 0.48)
      .fill({ color: colors.ink, alpha: 0.09 });
    context.circle(0, -radius, radius).fill(colors.treeDark);
    context
      .circle(-radius * 0.2, -radius * 1.16, radius * 0.74)
      .fill(colors.tree);
    context
      .circle(-radius * 0.38, -radius * 1.36, radius * 0.24)
      .fill({ color: mixHex(colors.tree, colors.surface, 0.45), alpha: 0.85 });
    return context;
  });
}

import type { Graphics } from "pixi.js";

import type { NodeSpec } from "@/simulation/model/graph";

import { faceQuad, groundQuad, type FaceFrame } from "../../iso/prism-geometry";
import { tileToWorld } from "../../iso/projection";
import { mixHex, shadeHex } from "../../theme/color";
import type { SceneColors } from "../../theme/scene-theme";
import {
  bodyFootprint,
  buildingColors,
  drawEdgeHighlights,
  drawPlinth,
  drawPrism,
  drawWindowGrid,
  faceFrame,
  glassColors,
} from "./shared";

/** Share of the final height already built on the construction site. */
const BUILT_SHARE = 0.45;
/** Scaffolding reaches this share of the final height. */
const SCAFFOLD_SHARE = 0.78;

function facePoint(frame: FaceFrame, t: number, lift: number) {
  return {
    x: frame.from.x + (frame.to.x - frame.from.x) * t,
    y: frame.from.y + (frame.to.y - frame.from.y) * t - frame.base - lift,
  };
}

/**
 * CI/CD: a construction site. The lower floors stand, scaffolding marks the rest, and a crane
 * holds the next module above it: every release is a new version being put in place.
 */
export function drawConstruction(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): void {
  const base = drawPlinth(graphics, node, colors);
  const { x, y } = node.tile;
  const { width, depth } = node.footprint;
  const crane = colors.statusRetry;
  const craneShade = shadeHex(crane, 0.8);

  // The mast stands at the back corner, so the building in front hides its foot.
  const mastX = x + 0.18;
  const mastY = y + 0.18;
  const mastTop = node.height + 22;
  drawPrism(
    graphics,
    {
      tileX: mastX,
      tileY: mastY,
      width: 0.16,
      depth: 0.16,
      height: mastTop,
      elevation: base,
    },
    { top: crane, left: crane, right: craneShade },
  );

  const built = bodyFootprint(node, base, node.height * BUILT_SHARE);
  drawPrism(graphics, built, buildingColors(colors));
  const glass = glassColors(colors);
  const floors = Math.max(2, Math.round((node.height * BUILT_SHARE) / 16));
  drawWindowGrid(graphics, faceFrame(built, "left"), {
    floors,
    columnsPerTile: 3,
    marginTop: 4,
    ...glass.left,
  });
  drawWindowGrid(graphics, faceFrame(built, "right"), {
    floors,
    columnsPerTile: 3,
    marginTop: 4,
    ...glass.right,
  });
  drawEdgeHighlights(graphics, built, colors.surface);

  // Scaffolding: poles and ledgers on the two visible faces of the unfinished floors.
  const full = bodyFootprint(node, base);
  const scaffoldColor = shadeHex(colors.plateSide, 0.72);
  for (const face of ["left", "right"] as const) {
    const frame = faceFrame(full, face);
    const bottom = node.height * BUILT_SHARE;
    const top = node.height * SCAFFOLD_SHARE;
    for (const t of [0.02, 0.35, 0.66, 0.98]) {
      const from = facePoint(frame, t, bottom);
      const to = facePoint(frame, t, top);
      graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    for (const lift of [bottom + (top - bottom) * 0.5, top]) {
      const from = facePoint(frame, 0.02, lift);
      const to = facePoint(frame, 0.98, lift);
      graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    graphics.stroke({ color: scaffoldColor, width: 1.3, alpha: 0.9 });
  }

  // Jib across the site with a short counter-jib and its weight behind the mast.
  const jibLift = base + mastTop - 6;
  drawPrism(
    graphics,
    {
      tileX: mastX + 0.04,
      tileY: y - 0.1,
      width: 0.08,
      depth: depth + 0.05,
      height: 4,
      elevation: jibLift,
    },
    { top: crane, left: crane, right: craneShade },
  );
  drawPrism(
    graphics,
    {
      tileX: mastX - 0.04,
      tileY: y - 0.08,
      width: 0.24,
      depth: 0.2,
      height: 7,
      elevation: jibLift - 3,
    },
    {
      top: colors.buildingTop,
      left: shadeHex(colors.buildingLeft, 0.85),
      right: shadeHex(colors.buildingRight, 0.85),
    },
  );

  // The next module hangs from the jib above the unfinished floors.
  const hookX = mastX + 0.08;
  const hookY = y + depth * 0.68;
  const moduleLift = base + node.height * SCAFFOLD_SHARE + 6;
  const hook = tileToWorld(hookX, hookY);
  graphics
    .moveTo(hook.x, hook.y - jibLift)
    .lineTo(hook.x, hook.y - moduleLift - 12)
    .stroke({ color: colors.ink3, width: 1.1 });
  drawPrism(
    graphics,
    {
      tileX: hookX - 0.2,
      tileY: hookY - 0.2,
      width: Math.min(0.5, width * 0.3),
      depth: 0.4,
      height: 12,
      elevation: moduleLift,
    },
    {
      top: colors.glassLight,
      left: colors.glass,
      right: shadeHex(colors.glass, 0.82),
    },
  );
}

/** Registry: a warehouse with loading gates and container images stacked on the roof. */
export function drawWarehouse(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): void {
  const base = drawPlinth(graphics, node, colors);
  const body = bodyFootprint(node, base);
  drawPrism(graphics, body, buildingColors(colors));

  const left = faceFrame(body, "left");
  const gate = shadeHex(colors.buildingRight, 0.76);
  for (const [t0, t1] of [
    [0.1, 0.42],
    [0.56, 0.88],
  ] as const) {
    graphics.poly(faceQuad(left, t0, t1, 0, node.height * 0.62)).fill(gate);
    for (const lift of [0.16, 0.31, 0.46]) {
      graphics
        .poly(
          faceQuad(left, t0, t1, node.height * lift, node.height * lift + 1.4),
        )
        .fill({ color: colors.surface, alpha: 0.45 });
    }
  }
  const glass = glassColors(colors);
  graphics
    .poly(
      faceQuad(
        faceFrame(body, "right"),
        0.1,
        0.9,
        node.height * 0.66,
        node.height * 0.84,
      ),
    )
    .fill(mixHex(glass.right.bottomColor, glass.right.topColor, 0.6));

  const roof = base + node.height;
  const { x, y } = node.tile;
  const { width, depth } = node.footprint;
  graphics
    .poly(groundQuad(x + 0.08, y + 0.08, width - 0.16, depth - 0.16, roof))
    .fill(shadeHex(colors.buildingTop, 0.955));

  // Container images, calm tints of the flow colours: stored artefacts, not live traffic.
  const containers = [
    { dx: 0.2, dy: 0.25, lift: 0, color: colors.flowSync },
    { dx: 0.2, dy: 0.7, lift: 0, color: colors.glass },
    { dx: 0.2, dy: 0.25, lift: 8, color: colors.flowAsync },
    { dx: 0.95, dy: 0.45, lift: 0, color: colors.glass },
  ];
  for (const container of containers) {
    drawPrism(
      graphics,
      {
        tileX: x + container.dx,
        tileY: y + container.dy,
        width: 0.62,
        depth: 0.36,
        height: 8,
        elevation: roof + container.lift,
      },
      {
        top: mixHex(container.color, colors.surface, 0.55),
        left: mixHex(container.color, colors.surface, 0.3),
        right: mixHex(shadeHex(container.color, 0.85), colors.surface, 0.3),
      },
    );
  }
  drawEdgeHighlights(graphics, body, colors.surface);
}

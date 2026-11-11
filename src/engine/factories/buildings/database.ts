import { FillGradient, type Graphics } from "pixi.js";

import type { NodeSpec } from "@/simulation/model/graph";

import { tileToWorld } from "../../iso/projection";
import { mixHex, shadeHex } from "../../theme/color";
import type { SceneColors } from "../../theme/scene-theme";
import { ISO_RADIUS_X, PLATE_HEIGHT } from "./shared";

const DISC_COUNT = 3;
const DISC_GAP = 5;
const ARC_SEGMENTS = 28;

/** Side of a vertical cylinder between `bottom` and `top` (world y), shaded light-left → dark-right. */
function cylinderSide(
  graphics: Graphics,
  centerX: number,
  radiusX: number,
  bottom: number,
  top: number,
  fill: FillGradient,
): void {
  const radiusY = radiusX / 2;
  const points: number[] = [centerX - radiusX, top];
  for (let step = 0; step <= ARC_SEGMENTS; step++) {
    const angle = Math.PI - (step / ARC_SEGMENTS) * Math.PI;
    points.push(
      centerX + Math.cos(angle) * radiusX,
      bottom + Math.sin(angle) * radiusY,
    );
  }
  points.push(centerX + radiusX, top);
  graphics.poly(points).fill(fill);
}

/** Lower half of a ground-plane ellipse: the visible rim of a disc. */
function frontRim(
  graphics: Graphics,
  centerX: number,
  centerY: number,
  radiusX: number,
): Graphics {
  const radiusY = radiusX / 2;
  graphics.moveTo(centerX - radiusX, centerY);
  for (let step = 1; step <= ARC_SEGMENTS; step++) {
    const angle = Math.PI - (step / ARC_SEGMENTS) * Math.PI;
    graphics.lineTo(
      centerX + Math.cos(angle) * radiusX,
      centerY + Math.sin(angle) * radiusY,
    );
  }
  return graphics;
}

/**
 * Stack of discs — the classic database icon, standing in the city.
 * Returns the gradients it created; the caller owns and destroys them.
 */
export function drawDatabase(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): FillGradient[] {
  const center = tileToWorld(
    node.tile.x + node.footprint.width / 2,
    node.tile.y + node.footprint.depth / 2,
  );
  const radiusX =
    (Math.min(node.footprint.width, node.footprint.depth) / 2) *
    ISO_RADIUS_X *
    0.92;
  const sideGradient = new FillGradient({
    type: "linear",
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    textureSpace: "local",
    colorStops: [
      { offset: 0, color: mixHex(colors.buildingLeft, colors.surface, 0.35) },
      { offset: 0.55, color: colors.buildingLeft },
      { offset: 1, color: shadeHex(colors.buildingRight, 0.95) },
    ],
  });
  const plinthGradient = new FillGradient({
    type: "linear",
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    textureSpace: "local",
    colorStops: [
      { offset: 0, color: colors.plateSide },
      { offset: 1, color: shadeHex(colors.plateSide, 0.9) },
    ],
  });

  // Round plinth.
  const plinthTop = center.y - PLATE_HEIGHT - 5;
  cylinderSide(
    graphics,
    center.x,
    radiusX * 1.12,
    center.y - PLATE_HEIGHT,
    plinthTop,
    plinthGradient,
  );
  graphics
    .ellipse(center.x, plinthTop, radiusX * 1.12, (radiusX * 1.12) / 2)
    .fill(mixHex(colors.buildingTop, colors.plateSide, 0.35));

  const discHeight = (node.height - DISC_GAP * (DISC_COUNT - 1)) / DISC_COUNT;
  let bottom = plinthTop;
  for (let disc = 0; disc < DISC_COUNT; disc++) {
    const top = bottom - discHeight;
    cylinderSide(graphics, center.x, radiusX, bottom, top, sideGradient);
    // Glowing rim: the disc "lights up" here when data is written.
    frontRim(graphics, center.x, bottom - 3, radiusX).stroke({
      color: colors.glassLight,
      width: 1.6,
      alpha: 0.55,
    });
    graphics
      .ellipse(center.x, top, radiusX, radiusX / 2)
      .fill(colors.buildingTop);

    if (disc < DISC_COUNT - 1) {
      // Recessed gap between discs.
      const gapTop = top - DISC_GAP;
      cylinderSide(
        graphics,
        center.x,
        radiusX * 0.9,
        top,
        gapTop,
        sideGradient,
      );
      graphics
        .ellipse(center.x, gapTop, radiusX * 0.9, (radiusX * 0.9) / 2)
        .fill(colors.buildingTop);
      bottom = gapTop;
    } else {
      bottom = top;
    }
  }

  // Lid: concentric rings like the database glyph.
  graphics
    .ellipse(center.x, bottom, radiusX * 0.72, radiusX * 0.36)
    .stroke({ color: colors.glass, width: 1.4, alpha: 0.35 });
  graphics
    .ellipse(center.x, bottom, radiusX * 0.32, radiusX * 0.16)
    .fill(mixHex(colors.glass, colors.glassLight, 0.5));
  frontRim(graphics, center.x, bottom, radiusX).stroke({
    color: colors.surface,
    width: 1.2,
    alpha: 0.8,
  });

  return [sideGradient, plinthGradient];
}

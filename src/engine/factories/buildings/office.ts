import type { Graphics } from "pixi.js";

import type { NodeSpec } from "@/simulation/model/graph";

import { groundQuad } from "../../iso/prism-geometry";
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
  isoCircle,
} from "./shared";

const ROOF_INSET = 0.08;
const SKYLIGHT_INSET = 0.3;

/** Glass office tower: services, gateway, scheduler, monitoring, notifications. */
export function drawOffice(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): void {
  const base = drawPlinth(graphics, node, colors);
  const body = bodyFootprint(node, base);
  const floors = node.floors ?? Math.max(2, Math.round(node.height / 18));
  const glass = glassColors(colors);

  drawPrism(graphics, body, buildingColors(colors));
  drawWindowGrid(graphics, faceFrame(body, "left"), {
    floors,
    columnsPerTile: 3,
    ...glass.left,
  });
  drawWindowGrid(graphics, faceFrame(body, "right"), {
    floors,
    columnsPerTile: 3,
    ...glass.right,
  });

  const roof = base + node.height;
  const { x, y } = node.tile;
  const { width, depth } = node.footprint;

  // Recessed roof inside a parapet, a glass skylight and a small plant room.
  graphics
    .poly(
      groundQuad(
        x + ROOF_INSET,
        y + ROOF_INSET,
        width - ROOF_INSET * 2,
        depth - ROOF_INSET * 2,
        roof,
      ),
    )
    .fill(shadeHex(colors.buildingTop, 0.955));
  graphics
    .poly(
      groundQuad(
        x + width * SKYLIGHT_INSET,
        y + depth * SKYLIGHT_INSET,
        width * (1 - SKYLIGHT_INSET * 2),
        depth * (1 - SKYLIGHT_INSET * 2),
        roof,
      ),
    )
    .fill(mixHex(colors.glass, colors.glassLight, 0.45))
    .stroke({ color: colors.surface, width: 1.2, alpha: 0.7 });
  drawPrism(
    graphics,
    {
      tileX: x + 0.16,
      tileY: y + 0.16,
      width: 0.28,
      depth: 0.22,
      height: 7,
      elevation: roof,
    },
    {
      top: colors.buildingTop,
      left: shadeHex(colors.buildingLeft, 0.97),
      right: shadeHex(colors.buildingRight, 0.97),
    },
  );

  drawEdgeHighlights(graphics, body, colors.surface);
  drawRoofAccessory(graphics, node, roof, colors);
}

function drawRoofAccessory(
  graphics: Graphics,
  node: NodeSpec,
  roof: number,
  colors: SceneColors,
): void {
  const centerX = node.tile.x + node.footprint.width * 0.72;
  const centerY = node.tile.y + node.footprint.depth * 0.28;
  const anchor = tileToWorld(centerX, centerY);
  const roofY = anchor.y - roof;

  switch (node.kind) {
    case "gateway":
    case "wsHub": {
      // Antenna; the realtime hub also broadcasts rings.
      graphics
        .moveTo(anchor.x, roofY)
        .lineTo(anchor.x, roofY - 30)
        .stroke({ color: colors.ink3, width: 1.6 });
      graphics.circle(anchor.x, roofY - 31, 3.2).fill(colors.flowSync);
      if (node.kind === "wsHub") {
        for (const radius of [9, 15]) {
          graphics
            .ellipse(anchor.x, roofY - 31, radius, radius / 2)
            .stroke({ color: colors.flowSync, width: 1.2, alpha: 0.45 });
        }
      }
      break;
    }
    case "observability": {
      // Radar dish on a short mast.
      graphics
        .moveTo(anchor.x, roofY)
        .lineTo(anchor.x, roofY - 12)
        .stroke({ color: colors.ink3, width: 1.6 });
      graphics
        .ellipse(anchor.x, roofY - 16, 11, 6)
        .fill(colors.surface)
        .stroke({ color: colors.ink3, width: 1.2, alpha: 0.8 });
      graphics.circle(anchor.x, roofY - 16, 1.8).fill(colors.statusSuccess);
      break;
    }
    case "scheduler": {
      // Clock spire.
      drawPrism(
        graphics,
        {
          tileX: centerX - 0.17,
          tileY: centerY - 0.17,
          width: 0.34,
          depth: 0.34,
          height: 22,
          elevation: roof,
        },
        buildingColors(colors),
      );
      isoCircle(graphics, centerX, centerY, 0.11, roof + 22)
        .fill(colors.surface)
        .stroke({ color: colors.statusRetry, width: 1.4 });
      break;
    }
    case "integration": {
      // A globe: this building stands for a third-party service on the internet.
      const globeY = roofY - 20;
      graphics
        .moveTo(anchor.x, roofY)
        .lineTo(anchor.x, globeY + 9)
        .stroke({ color: colors.ink3, width: 1.6 });
      graphics
        .circle(anchor.x, globeY, 10)
        .fill(colors.surface)
        .stroke({ color: colors.flowSync, width: 1.6 });
      graphics
        .ellipse(anchor.x, globeY, 4.5, 10)
        .stroke({ color: colors.flowSync, width: 1.2, alpha: 0.8 })
        .moveTo(anchor.x - 10, globeY)
        .lineTo(anchor.x + 10, globeY)
        .stroke({ color: colors.flowSync, width: 1.2, alpha: 0.8 });
      break;
    }
    default:
      break;
  }
}

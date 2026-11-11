import type { Graphics } from "pixi.js";

import type { NodeSpec } from "@/simulation/model/graph";
import { SeededRng } from "@/simulation/runtime/seeded-rng";

import {
  faceQuad,
  groundQuad,
  projectTilePolygon,
} from "../../iso/prism-geometry";
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
  hashId,
  isoCircle,
} from "./shared";

/** Redis: a low glass pavilion with a lightning bolt on the roof. */
export function drawCache(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): void {
  const base = drawPlinth(graphics, node, colors);
  const body = bodyFootprint(node, base);
  const glass = glassColors(colors);
  drawPrism(graphics, body, buildingColors(colors));
  for (const face of ["left", "right"] as const) {
    const frame = faceFrame(body, face);
    const tone = glass[face];
    graphics
      .poly(faceQuad(frame, 0.08, 0.92, 6, node.height - 7))
      .fill(mixHex(tone.bottomColor, tone.topColor, 0.55));
    graphics
      .poly(faceQuad(frame, 0.08, 0.92, node.height - 12, node.height - 7))
      .fill({
        color: colors.surface,
        alpha: 0.35,
      });
  }

  const roof = base + node.height;
  const centerX = node.tile.x + node.footprint.width / 2;
  const centerY = node.tile.y + node.footprint.depth / 2;
  // Bolt outline in screen-aligned units (u → right, v → down), laid flat onto the roof plane.
  const scale = Math.min(node.footprint.width, node.footprint.depth) * 0.2;
  const bolt = [
    [0.12, -1],
    [-0.42, 0.12],
    [-0.02, 0.12],
    [-0.16, 1],
    [0.44, -0.2],
    [0.04, -0.2],
    [0.22, -1],
  ].map(([u = 0, v = 0]) => ({
    x: centerX + (u + v) * scale,
    y: centerY + (v - u) * scale,
  }));
  graphics.poly(projectTilePolygon(bolt, roof)).fill(colors.statusCached);
  drawEdgeHighlights(graphics, body, colors.surface);
}

/** Message broker: a long logistics terminal with loading docks and queue lanes on the roof. */
export function drawBroker(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): void {
  const base = drawPlinth(graphics, node, colors);
  const body = bodyFootprint(node, base);
  const glass = glassColors(colors);
  drawPrism(graphics, body, buildingColors(colors));

  const left = faceFrame(body, "left");
  const docks = Math.max(3, Math.round(left.lengthTiles * 1.8));
  const dockWidth = 0.84 / docks;
  for (let dock = 0; dock < docks; dock++) {
    const t0 = 0.08 + dock * dockWidth + dockWidth * 0.14;
    const t1 = t0 + dockWidth * 0.72;
    graphics
      .poly(faceQuad(left, t0, t1, 0, node.height * 0.5))
      .fill(shadeHex(colors.buildingRight, 0.72));
    graphics
      .poly(faceQuad(left, t0, t1, node.height * 0.5, node.height * 0.5 + 2))
      .fill(colors.surface);
  }
  graphics
    .poly(faceQuad(left, 0.06, 0.94, node.height * 0.64, node.height * 0.86))
    .fill(mixHex(glass.left.bottomColor, glass.left.topColor, 0.6));
  const right = faceFrame(body, "right");
  graphics
    .poly(faceQuad(right, 0.1, 0.9, node.height * 0.64, node.height * 0.86))
    .fill(mixHex(glass.right.bottomColor, glass.right.topColor, 0.6));

  // Queue lanes with waiting messages.
  const roof = base + node.height;
  const rng = new SeededRng(hashId(node.id));
  const lanes = 3;
  const laneDepth = (node.footprint.depth - 0.4) / lanes;
  for (let lane = 0; lane < lanes; lane++) {
    const laneY = node.tile.y + 0.2 + lane * laneDepth;
    graphics
      .poly(
        groundQuad(
          node.tile.x + 0.15,
          laneY + 0.06,
          node.footprint.width - 0.3,
          laneDepth - 0.12,
          roof,
        ),
      )
      .fill({ color: colors.flowAsync, alpha: 0.16 });
    const messages = 1 + Math.floor(rng.range(0, 3));
    for (let message = 0; message < messages; message++) {
      drawPrism(
        graphics,
        {
          tileX: node.tile.x + 0.3 + rng.range(0, node.footprint.width - 0.75),
          tileY: laneY + 0.12,
          width: 0.2,
          depth: laneDepth - 0.24,
          height: 5,
          elevation: roof,
        },
        {
          top: mixHex(colors.flowAsync, colors.surface, 0.45),
          left: colors.flowAsync,
          right: shadeHex(colors.flowAsync, 0.82),
        },
      );
    }
  }
  drawEdgeHighlights(graphics, body, colors.surface);
}

/** Dead letter queue: a low yard building where messages that ran out of retries pile up. */
export function drawDeadLetters(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): void {
  const base = drawPlinth(graphics, node, colors);
  const body = bodyFootprint(node, base);
  drawPrism(graphics, body, buildingColors(colors));
  const left = faceFrame(body, "left");
  graphics
    .poly(faceQuad(left, 0.2, 0.8, 0, node.height * 0.62))
    .fill(shadeHex(colors.buildingRight, 0.72));
  graphics
    .poly(faceQuad(left, 0.08, 0.92, node.height - 6, node.height - 3))
    .fill({ color: colors.statusFailed, alpha: 0.75 });

  const roof = base + node.height;
  const rng = new SeededRng(hashId(node.id));
  const crate = {
    top: mixHex(colors.statusFailed, colors.surface, 0.55),
    left: mixHex(colors.statusFailed, colors.surface, 0.25),
    right: shadeHex(colors.statusFailed, 0.85),
  };
  for (let index = 0; index < 4; index++) {
    drawPrism(
      graphics,
      {
        tileX: node.tile.x + 0.15 + (index % 2) * 0.42 + rng.range(0, 0.06),
        tileY:
          node.tile.y +
          0.15 +
          Math.floor(index / 2) * 0.42 +
          rng.range(0, 0.06),
        width: 0.28,
        depth: 0.28,
        height: 6 + rng.range(0, 4),
        elevation: roof,
      },
      crate,
    );
  }
  drawEdgeHighlights(graphics, body, colors.surface);
}

/** Background worker: a workshop with wide windows and roof fans. */
export function drawWorker(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): void {
  const base = drawPlinth(graphics, node, colors);
  const body = bodyFootprint(node, base);
  const glass = glassColors(colors);
  const floors = node.floors ?? 2;
  drawPrism(graphics, body, buildingColors(colors));
  drawWindowGrid(graphics, faceFrame(body, "left"), {
    floors,
    columnsPerTile: 1.7,
    widthRatio: 0.8,
    heightRatio: 0.62,
    ...glass.left,
  });
  drawWindowGrid(graphics, faceFrame(body, "right"), {
    floors,
    columnsPerTile: 1.7,
    widthRatio: 0.8,
    heightRatio: 0.62,
    ...glass.right,
  });

  const roof = base + node.height;
  const { x, y } = node.tile;
  const { width, depth } = node.footprint;
  for (const [u, v] of [
    [0.3, 0.32],
    [0.68, 0.62],
  ] as const) {
    const fanX = x + width * u;
    const fanY = y + depth * v;
    isoCircle(graphics, fanX, fanY, 0.22, roof)
      .fill(shadeHex(colors.buildingTop, 0.9))
      .stroke({ color: colors.ink3, width: 1, alpha: 0.4 });
    const hub = tileToWorld(fanX, fanY);
    const hubY = hub.y - roof;
    graphics
      .moveTo(hub.x - 13, hubY)
      .lineTo(hub.x + 13, hubY)
      .moveTo(hub.x, hubY - 6.5)
      .lineTo(hub.x, hubY + 6.5)
      .stroke({ color: colors.ink3, width: 1.4, alpha: 0.55 });
    graphics.ellipse(hub.x, hubY, 3, 1.5).fill(colors.flowAsync);
  }
  drawEdgeHighlights(graphics, body, colors.surface);
}

/** Client: a low house whose front wall is a glowing screen. */
export function drawClient(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): void {
  const base = drawPlinth(graphics, node, colors);
  const body = bodyFootprint(node, base);
  drawPrism(graphics, body, buildingColors(colors));

  const left = faceFrame(body, "left");
  graphics
    .poly(faceQuad(left, 0.14, 0.86, 4, node.height - 4))
    .fill(shadeHex(colors.ink, 1.6));
  graphics
    .poly(faceQuad(left, 0.18, 0.82, 6, node.height - 6))
    .fill(mixHex(colors.flowSync, colors.surface, 0.15));
  graphics
    .poly(faceQuad(left, 0.22, 0.6, node.height - 11, node.height - 9))
    .fill({
      color: colors.surface,
      alpha: 0.8,
    });
  const right = faceFrame(body, "right");
  graphics
    .poly(faceQuad(right, 0.3, 0.7, 7, node.height - 7))
    .fill(glassColors(colors).right.topColor);
  drawEdgeHighlights(graphics, body, colors.surface);
}

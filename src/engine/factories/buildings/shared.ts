import type { Graphics } from "pixi.js";

import type { NodeSpec } from "@/simulation/model/graph";

import {
  faceFrame,
  faceQuad,
  prismFaces,
  type FaceFrame,
  type PrismFootprint,
} from "../../iso/prism-geometry";
import { tileToWorld } from "../../iso/projection";
import { mixHex, shadeHex } from "../../theme/color";
import type { SceneColors } from "../../theme/scene-theme";

/** City block plates are raised above the road surface by this many world pixels. */
export const PLATE_HEIGHT = 4;
const PLINTH_HEIGHT = 5;
const PLINTH_MARGIN = 0.08;
/** World pixels per tile of radius for a circle lying on the ground plane (64·√2). */
export const ISO_RADIUS_X = 64 * Math.SQRT2;

export interface FaceColors {
  readonly top: string;
  readonly left: string;
  readonly right: string;
}

export function drawPrism(
  graphics: Graphics,
  footprint: PrismFootprint,
  colors: FaceColors,
): void {
  const faces = prismFaces(footprint);
  graphics.poly(faces.left).fill(colors.left);
  graphics.poly(faces.right).fill(colors.right);
  graphics.poly(faces.top).fill(colors.top);
}

/** Thin light strokes on the front vertical edge and the two front roof edges: reads as daylight on corners. */
export function drawEdgeHighlights(
  graphics: Graphics,
  footprint: PrismFootprint,
  color: string,
): void {
  const faces = prismFaces(footprint);
  const [, , rx, ry, fx, fy, lx, ly] = faces.top;
  const [, , frontX, frontBaseY] = faces.left;
  graphics
    .moveTo(lx!, ly!)
    .lineTo(fx!, fy!)
    .lineTo(rx!, ry!)
    .moveTo(frontX!, frontBaseY!)
    .lineTo(fx!, fy!)
    .stroke({ color, width: 1.2, alpha: 0.75 });
}

export function buildingColors(colors: SceneColors): FaceColors {
  return {
    top: colors.buildingTop,
    left: colors.buildingLeft,
    right: colors.buildingRight,
  };
}

/** Slightly wider base that every building stands on; returns the elevation of its top. */
export function drawPlinth(
  graphics: Graphics,
  node: NodeSpec,
  colors: SceneColors,
): number {
  drawPrism(
    graphics,
    {
      tileX: node.tile.x - PLINTH_MARGIN,
      tileY: node.tile.y - PLINTH_MARGIN,
      width: node.footprint.width + PLINTH_MARGIN * 2,
      depth: node.footprint.depth + PLINTH_MARGIN * 2,
      height: PLINTH_HEIGHT,
      elevation: PLATE_HEIGHT,
    },
    {
      top: mixHex(colors.buildingTop, colors.plateSide, 0.35),
      left: colors.plateSide,
      right: shadeHex(colors.plateSide, 0.93),
    },
  );
  return PLATE_HEIGHT + PLINTH_HEIGHT;
}

export function bodyFootprint(
  node: NodeSpec,
  elevation: number,
  height = node.height,
): PrismFootprint {
  return {
    tileX: node.tile.x,
    tileY: node.tile.y,
    width: node.footprint.width,
    depth: node.footprint.depth,
    height,
    elevation,
  };
}

interface WindowGridOptions {
  readonly floors: number;
  /** Window columns per tile of face length. */
  readonly columnsPerTile: number;
  readonly bottomColor: string;
  readonly topColor: string;
  /** Glass share of each column and floor; the rest is the frame. */
  readonly widthRatio?: number;
  readonly heightRatio?: number;
  readonly marginBottom?: number;
  readonly marginTop?: number;
}

/** Vertical glass strips split by thin floor mullions, lighter towards the top like sky reflections. */
export function drawWindowGrid(
  graphics: Graphics,
  frame: FaceFrame,
  options: WindowGridOptions,
): void {
  const {
    floors,
    columnsPerTile,
    bottomColor,
    topColor,
    widthRatio = 0.62,
    heightRatio = 0.78,
    marginBottom = 9,
    marginTop = 8,
  } = options;

  const columns = Math.max(2, Math.round(frame.lengthTiles * columnsPerTile));
  const sideMargin = 0.08;
  const columnWidth = (1 - sideMargin * 2) / columns;
  const floorHeight = (frame.height - marginBottom - marginTop) / floors;

  for (let floor = 0; floor < floors; floor++) {
    const color = mixHex(
      bottomColor,
      topColor,
      floors === 1 ? 0.5 : floor / (floors - 1),
    );
    const h0 =
      marginBottom +
      floor * floorHeight +
      (floorHeight * (1 - heightRatio)) / 2;
    const h1 = h0 + floorHeight * heightRatio;
    for (let column = 0; column < columns; column++) {
      const t0 =
        sideMargin +
        column * columnWidth +
        (columnWidth * (1 - widthRatio)) / 2;
      graphics
        .poly(faceQuad(frame, t0, t0 + columnWidth * widthRatio, h0, h1))
        .fill(color);
    }
  }
}

/** Glass colors per face: the front-right face is in shade. */
export function glassColors(colors: SceneColors) {
  return {
    left: { bottomColor: colors.glass, topColor: colors.glassLight },
    right: {
      bottomColor: shadeHex(colors.glass, 0.8),
      topColor: shadeHex(colors.glassLight, 0.86),
    },
  };
}

export { faceFrame };

/** Ellipse of a ground-plane circle of `radius` tiles centered at tile (x, y), lifted by `elevation`. */
export function isoCircle(
  graphics: Graphics,
  tileX: number,
  tileY: number,
  radius: number,
  elevation: number,
): Graphics {
  const center = tileToWorld(tileX, tileY);
  const radiusX = radius * ISO_RADIUS_X;
  return graphics.ellipse(center.x, center.y - elevation, radiusX, radiusX / 2);
}

/** Stable small integer from an id, for deterministic per-building variation. */
export function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

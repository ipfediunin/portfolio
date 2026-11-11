import { GraphicsContext } from "pixi.js";

import type { VehicleRoute } from "@/simulation/model/graph";

import {
  faceFrame,
  faceQuad,
  prismFaces,
  type PrismFootprint,
} from "../iso/prism-geometry";
import { tileToWorld } from "../iso/projection";
import { mixHex, shadeHex } from "../theme/color";
import type { SceneColors } from "../theme/scene-theme";
import type { FaceColors } from "./buildings/shared";

/** Travel direction along a tile axis: east = +x, west = −x, south = +y, north = −y. */
export type Heading = "east" | "west" | "south" | "north";
export type Livery = VehicleRoute["livery"];

const LENGTH = 0.46;
const WIDTH = 0.26;
const CAB_LENGTH = 0.15;
const CARGO_HEIGHT = 17;
const CAB_HEIGHT = 12;

/** Maps a world-space direction of travel to the tile-axis heading of the sprite. */
export function headingFromDirection(
  directionX: number,
  directionY: number,
): Heading {
  if (directionX >= 0) return directionY >= 0 ? "east" : "north";
  return directionY >= 0 ? "south" : "west";
}

function drawBox(
  context: GraphicsContext,
  footprint: PrismFootprint,
  colors: FaceColors,
): void {
  const faces = prismFaces(footprint);
  context.poly(faces.left).fill(colors.left);
  context.poly(faces.right).fill(colors.right);
  context.poly(faces.top).fill(colors.top);
}

function wheel(
  context: GraphicsContext,
  tileX: number,
  tileY: number,
  color: string,
): void {
  const point = tileToWorld(tileX, tileY);
  context.ellipse(point.x, point.y - 1.5, 3.2, 2.3).fill(color);
}

function buildVan(
  heading: Heading,
  cargo: FaceColors,
  colors: SceneColors,
): GraphicsContext {
  const context = new GraphicsContext();
  const cab: FaceColors = {
    top: colors.surface,
    left: mixHex(colors.buildingTop, colors.surface, 0.5),
    right: colors.buildingLeft,
  };
  const windowColor = shadeHex(colors.ink, 1.9);
  const half = LENGTH / 2;
  const along = heading === "east" || heading === "west";
  const forward = heading === "east" || heading === "south";

  context
    .ellipse(0, 2, LENGTH * 52, LENGTH * 21)
    .fill({ color: colors.ink, alpha: 0.12 });

  // Footprints along the travel axis, then mapped onto x or y.
  const cargoStart = forward ? -half : -half + CAB_LENGTH;
  const cabStart = forward ? half - CAB_LENGTH : -half;
  const box = (
    start: number,
    length: number,
    width: number,
    height: number,
  ): PrismFootprint =>
    along
      ? { tileX: start, tileY: -width / 2, width: length, depth: width, height }
      : { tileX: -width / 2, tileY: start, width, depth: length, height };
  const cargoBox = box(cargoStart, LENGTH - CAB_LENGTH, WIDTH, CARGO_HEIGHT);
  const cabBox = box(cabStart, CAB_LENGTH, WIDTH * 0.94, CAB_HEIGHT);

  // Wheels on the visible long side (left face for x-travel, right face for y-travel).
  const wheelColor = shadeHex(colors.ink, 1.4);
  for (const offset of [-half + 0.09, half - 0.09]) {
    if (along) wheel(context, offset, WIDTH / 2, wheelColor);
    else wheel(context, WIDTH / 2, offset, wheelColor);
  }

  // Painter's order: the part further back is drawn first.
  const parts = forward
    ? [
        { footprint: cargoBox, colors: cargo },
        { footprint: cabBox, colors: cab },
      ]
    : [
        { footprint: cabBox, colors: cab },
        { footprint: cargoBox, colors: cargo },
      ];
  for (const part of parts) drawBox(context, part.footprint, part.colors);

  // Windshield on the visible front face, side window on the visible side face.
  const sideFace = along ? "left" : "right";
  context
    .poly(faceQuad(faceFrame(cabBox, sideFace), 0.18, 0.82, 6, 10))
    .fill(windowColor);
  if (forward) {
    const frontFace = along ? "right" : "left";
    context
      .poly(faceQuad(faceFrame(cabBox, frontFace), 0.12, 0.88, 5, 10.5))
      .fill(windowColor);
  }
  return context;
}

export type VehicleContexts = Readonly<
  Record<Livery, Readonly<Record<Heading, GraphicsContext>>>
>;

export function createVehicleContexts(colors: SceneColors): VehicleContexts {
  const liveries: Record<Livery, FaceColors> = {
    white: {
      top: colors.surface,
      left: mixHex(colors.buildingTop, colors.surface, 0.3),
      right: shadeHex(colors.buildingLeft, 0.98),
    },
    violet: {
      top: mixHex(colors.flowAsync, colors.surface, 0.42),
      left: mixHex(colors.flowAsync, colors.surface, 0.12),
      right: shadeHex(colors.flowAsync, 0.84),
    },
  };
  const headings: readonly Heading[] = ["east", "west", "south", "north"];
  const build = (livery: Livery) =>
    Object.fromEntries(
      headings.map((heading) => [
        heading,
        buildVan(heading, liveries[livery], colors),
      ]),
    ) as Record<Heading, GraphicsContext>;
  return { white: build("white"), violet: build("violet") };
}

export function destroyVehicleContexts(contexts: VehicleContexts): void {
  for (const byHeading of Object.values(contexts)) {
    for (const context of Object.values(byHeading)) context.destroy();
  }
}

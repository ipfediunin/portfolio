import { Graphics } from "pixi.js";

import {
  expandRect,
  nodeRect,
  roadRect,
  type NodeSpec,
  type WorldGraph,
} from "@/simulation/model/graph";

import { PLATE_HEIGHT } from "../factories/buildings/shared";
import { groundQuad, prismFaces } from "../iso/prism-geometry";
import { shadeHex } from "../theme/color";
import type { SceneColors } from "../theme/scene-theme";
import { GRASS_MARGIN } from "./decor-layout";
import { cityBlocks, GROUND_SURROUND as SURROUND } from "./ground-layout";

const CURB = 0.1;
const DASH_LENGTH = 0.32;
const DASH_GAP = 0.34;
const PLATE_INSET = 0.06;

/** Static ground: base, roads with curbs and lane dashes, raised block plates and grass plots. */
export function drawGround(
  graph: WorldGraph,
  buildings: readonly NodeSpec[],
  colors: SceneColors,
): Graphics {
  const ground = new Graphics({ label: "ground" });
  const { width, height } = graph.size;

  ground
    .poly(
      groundQuad(
        -SURROUND,
        -SURROUND,
        width + SURROUND * 2,
        height + SURROUND * 2,
      ),
    )
    .fill(colors.ground);

  const roadRects = graph.roads.map(roadRect);
  for (const rect of roadRects) {
    ground
      .poly(
        groundQuad(
          rect.x0 - CURB,
          rect.y0 - CURB,
          rect.x1 - rect.x0 + CURB * 2,
          rect.y1 - rect.y0 + CURB * 2,
        ),
      )
      .fill(colors.sidewalk);
  }
  for (const rect of roadRects) {
    ground
      .poly(groundQuad(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0))
      .fill(colors.road);
  }

  // Lane dashes stop short of intersections.
  const crossings = (along: "x" | "y") =>
    graph.roads.filter((road) => road.axis !== along).map((road) => road.line);
  for (const road of graph.roads) {
    const blocked = crossings(road.axis);
    for (
      let position = road.from;
      position + DASH_LENGTH <= road.to;
      position += DASH_LENGTH + DASH_GAP
    ) {
      const end = position + DASH_LENGTH;
      if (blocked.some((line) => end > line - 0.15 && position < line + 1.15))
        continue;
      const dash =
        road.axis === "x"
          ? groundQuad(position, road.line + 0.47, DASH_LENGTH, 0.06)
          : groundQuad(road.line + 0.47, position, 0.06, DASH_LENGTH);
      ground.poly(dash).fill({ color: colors.roadMark, alpha: 0.95 });
    }
  }

  // Raised plates: side faces first, then the tops.
  const plates = cityBlocks(graph).map((block) => ({
    tileX: block.x0 + PLATE_INSET,
    tileY: block.y0 + PLATE_INSET,
    width: block.x1 - block.x0 - PLATE_INSET * 2,
    depth: block.y1 - block.y0 - PLATE_INSET * 2,
    height: PLATE_HEIGHT,
  }));
  for (const plate of plates) {
    const faces = prismFaces(plate);
    ground.poly(faces.left).fill(colors.plateSide);
    ground.poly(faces.right).fill(shadeHex(colors.plateSide, 0.94));
  }
  for (const plate of plates)
    ground.poly(prismFaces(plate).top).fill(colors.plate);

  for (const node of buildings) {
    const grass = expandRect(nodeRect(node), GRASS_MARGIN);
    ground
      .poly(
        groundQuad(
          grass.x0,
          grass.y0,
          grass.x1 - grass.x0,
          grass.y1 - grass.y0,
          PLATE_HEIGHT,
        ),
      )
      .fill(colors.grass);
  }

  return ground;
}

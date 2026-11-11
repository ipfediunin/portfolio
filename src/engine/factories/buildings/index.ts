import { Graphics, type FillGradient } from "pixi.js";

import { nodeCenter, type NodeSpec } from "@/simulation/model/graph";

import { depthKey } from "../../iso/projection";
import { mixHex } from "../../theme/color";
import type { SceneColors } from "../../theme/scene-theme";
import { drawDatabase } from "./database";
import { drawOffice } from "./office";
import { drawConstruction, drawWarehouse } from "./ops";
import {
  drawBroker,
  drawCache,
  drawClient,
  drawDeadLetters,
  drawWorker,
} from "./utility";

export { PLATE_HEIGHT } from "./shared";

/**
 * Calm palette for anonymous background buildings: grey-blue glass instead of saturated blue,
 * so the system's own components keep the color ("color = information").
 */
export function backgroundPalette(colors: SceneColors): SceneColors {
  return {
    ...colors,
    glass: mixHex(colors.glassDim, colors.buildingLeft, 0.25),
    glassLight: mixHex(colors.glassDim, colors.surface, 0.55),
  };
}

export interface BuildingArt {
  readonly view: Graphics;
  /** Gradients owned by this building; destroy them together with the view. */
  readonly gradients: readonly FillGradient[];
}

/**
 * Builds a building for a graph node. The silhouette encodes the role, like icons on an
 * architecture diagram: cylinder = database, terminal = broker, workshop = worker.
 */
export function createBuilding(
  node: NodeSpec,
  colors: SceneColors,
): BuildingArt {
  const view = new Graphics({ label: node.id });
  let gradients: FillGradient[] = [];

  switch (node.kind) {
    case "database":
      gradients = drawDatabase(view, node, colors);
      break;
    case "cache":
      drawCache(view, node, colors);
      break;
    case "broker":
      drawBroker(view, node, colors);
      break;
    case "worker":
      drawWorker(view, node, colors);
      break;
    case "client":
      drawClient(view, node, colors);
      break;
    case "dlq":
      drawDeadLetters(view, node, colors);
      break;
    case "ci":
      drawConstruction(view, node, colors);
      break;
    case "storage":
      drawWarehouse(view, node, colors);
      break;
    default:
      drawOffice(view, node, colors);
  }

  const center = nodeCenter(node);
  view.zIndex = depthKey(center.x, center.y);
  return { view, gradients };
}

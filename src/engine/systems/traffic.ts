import type { Container, Sprite } from "pixi.js";

import type { WorldGraph } from "@/simulation/model/graph";

import {
  createVehicleContexts,
  destroyVehicleContexts,
  headingFromDirection,
  type Heading,
  type Livery,
} from "../factories/vehicles";
import {
  depthKey,
  tileToWorld,
  worldToTile,
  type Point2,
} from "../iso/projection";
import type { BakedArt, TextureBaker } from "../rendering/texture-baker";
import type { SceneColors } from "../theme/scene-theme";
import { PolylinePath, type PathSample } from "../world/polyline-path";

/** World pixels per tile travelled along either tile axis (|tileToWorld(1, 0)|). */
const WORLD_PER_TILE = Math.hypot(64, 32);
/** Depth is quantized so the entity layer is re-sorted only when a van moves noticeably. */
const DEPTH_STEP = 0.125;

interface Vehicle {
  readonly sprite: Sprite;
  readonly path: PolylinePath;
  readonly livery: Livery;
  /** World pixels per second. */
  readonly speed: number;
  art: BakedArt | null;
  heading: Heading | null;
  distance: number;
}

export interface Traffic {
  update(deltaMs: number): void;
  /** Fades the vans together with the rest of the city when a node is in focus. */
  setOpacity(alpha: number): void;
  destroy(): void;
}

/** Vans driving along road lanes. They live in the depth-sorted entity layer next to buildings. */
export function createTraffic(
  graph: WorldGraph,
  colors: SceneColors,
  layer: Container,
  baker: TextureBaker,
): Traffic {
  const contexts = createVehicleContexts(colors);
  const arts = {
    white: bakeHeadings(contexts.white),
    violet: bakeHeadings(contexts.violet),
  };
  function bakeHeadings(
    byHeading: (typeof contexts)[Livery],
  ): Record<Heading, BakedArt> {
    return {
      east: baker.fromContext(byHeading.east),
      west: baker.fromContext(byHeading.west),
      south: baker.fromContext(byHeading.south),
      north: baker.fromContext(byHeading.north),
    };
  }

  const vehicles: Vehicle[] = [];
  for (const route of graph.vehicleRoutes) {
    const path = new PolylinePath(
      route.points.map((point) => tileToWorld(point.x, point.y)),
    );
    for (let index = 0; index < route.count; index++) {
      const sprite = arts[route.livery].east.createSprite();
      layer.addChild(sprite);
      vehicles.push({
        sprite,
        path,
        livery: route.livery,
        speed: route.speed * WORLD_PER_TILE,
        art: arts[route.livery].east,
        heading: null,
        distance: ((route.phase + index / route.count) % 1) * path.length,
      });
    }
  }

  const sample: PathSample = { x: 0, y: 0, directionX: 1, directionY: 0 };
  const tile: Point2 = { x: 0, y: 0 };

  function place(vehicle: Vehicle): void {
    vehicle.path.sampleAt(vehicle.distance, sample);
    vehicle.sprite.position.set(sample.x, sample.y);
    const heading = headingFromDirection(sample.directionX, sample.directionY);
    if (heading !== vehicle.heading) {
      vehicle.heading = heading;
      vehicle.art?.release(vehicle.sprite);
      vehicle.art = arts[vehicle.livery][heading];
      vehicle.art.use(vehicle.sprite);
    }
    worldToTile(sample.x, sample.y, tile);
    vehicle.sprite.zIndex =
      Math.round(depthKey(tile.x, tile.y) / DEPTH_STEP) * DEPTH_STEP;
  }

  for (const vehicle of vehicles) place(vehicle);

  return {
    update(deltaMs) {
      const seconds = deltaMs / 1000;
      for (const vehicle of vehicles) {
        // Lanes run past the map edges, where the scene fades out; wrapping there is invisible.
        vehicle.distance =
          (vehicle.distance + vehicle.speed * seconds) % vehicle.path.length;
        place(vehicle);
      }
    },
    setOpacity(alpha) {
      for (const vehicle of vehicles) vehicle.sprite.alpha = alpha;
    },
    destroy() {
      for (const vehicle of vehicles) vehicle.sprite.destroy();
      // The baker destroys its textures and the Graphics wrappers; the shared contexts are ours.
      destroyVehicleContexts(contexts);
    },
  };
}

import {
  Container,
  Point,
  type FillGradient,
  type GraphicsContext,
  type Renderer,
  type Sprite,
} from "pixi.js";

import { nodeCenter, type WorldGraph } from "@/simulation/model/graph";

import type { Bounds } from "../camera/fit";
import {
  backgroundPalette,
  createBuilding,
  PLATE_HEIGHT,
} from "../factories/buildings";
import {
  createFootprintShadow,
  createGroundPlane,
  createSoftShadowTexture,
} from "../factories/soft-shadow";
import { createTreeContexts, TREE_SIZES } from "../factories/trees";
import { tileAreaBounds } from "../iso/bounds";
import { depthKey, tileToWorld } from "../iso/projection";
import { TextureBaker } from "../rendering/texture-baker";
import { createTraffic, type Traffic } from "../systems/traffic";
import type { SceneTheme } from "../theme/scene-theme";
import type { MotionPreference, PlayerHandle, PlayerMode } from "../types";
import { createFlowNetwork, type FlowNetwork } from "../views/flow-network";
import { NameTag } from "../views/name-tag";
import { createNodeBeacon } from "../views/node-beacon";
import { createNodeFocus } from "../views/node-focus";
import { NodeTooltip } from "../views/node-tooltip";
import {
  createRequestJourney,
  type RequestJourneyView,
} from "../views/request-journey";
import { createRunVisualizer } from "../views/run-visualizer";
import { StatusCard } from "../views/status-card";
import { planDecor } from "./decor-layout";
import { drawGround } from "./ground";
import { createLinkPaths } from "./link-paths";
import { createNodeHitAreas, pickNode } from "./node-picking";

/** Building plinth height (see factories/buildings/shared.ts) plus breathing room above the roof. */
const CARD_LIFT = 5 + 16;
const CARD_STAGGER_MS = 450;
const CARD_FIRST_DELAY_MS = 700;
/** Gap between a roof and the hover tooltip, and the tooltip's distance to the canvas edges. */
const TOOLTIP_LIFT = 12;
const NAME_TAG_LIFT = 8;
/** Names of buildings outside the focus fade back with them. */
const NAME_TAG_DIMMED = 0.35;
const TOOLTIP_EDGE = 6;

interface CityViewOptions {
  readonly motion: MotionPreference;
  /** Moving data pulses; disabled on the low quality tier. */
  readonly particles: boolean;
}

export interface CityView {
  /** World-space content; the camera sets its position and scale. */
  readonly world: Container;
  /** Screen-space UI (status cards); never scaled. */
  readonly overlay: Container;
  /** World area the camera keeps in frame for the current view. */
  readonly focusBounds: Bounds;
  readonly view: string;
  /**
   * Switches the view: the camera target (`focusBounds`) and, for a district, which part of the
   * world stays at full strength. The camera itself is moved by the stage. An unknown view id is
   * reported and ignored.
   */
  setView(view: string, immediate: boolean): void;
  /** Cards appear and move between camera changes, so the overlay must be re-synced every frame. */
  readonly dynamicOverlay: boolean;
  /** The system node under a screen point (canvas CSS px), or null. */
  pickNode(screenX: number, screenY: number): string | null;
  /** Focus mode for these nodes (empty clears it); `immediate` skips the fade (reduced motion). */
  setFocus(nodeIds: readonly string[], immediate: boolean): void;
  /** Hover label above a node; null hides it. Placed by the next `syncOverlay`. */
  setTooltip(nodeId: string | null): void;
  /** A pulsing ground ring around the node the visitor can act from; null removes it. */
  setBeacon(nodeId: string | null): void;
  /** World point just above a node's roof, where its name sits; null for a node of another world. */
  nodeAnchor(nodeId: string): { readonly x: number; readonly y: number } | null;
  /** `ambient` = traffic, data pulses and the scripted story; off for reduced motion. */
  update(deltaMs: number, ambient: boolean): void;
  /**
   * Re-anchors screen-space cards after the camera moved (cards outside `safeArea` are hidden) and
   * lets run packets adapt to the new zoom.
   */
  syncOverlay(safeArea: OverlaySafeArea): void;
  /** Texture pixels per world unit the art is displayed at; re-bakes art when it drifts. */
  setDetailResolution(resolution: number, force?: boolean): void;
  /**
   * Draws the player's runs. "playground" frames the whole system and silences the ambient story;
   * "visitor" keeps the hero as it is and only pauses its scripted request. Returns the disconnect.
   */
  connectPlayer(player: PlayerHandle, mode: PlayerMode): () => void;
  destroy(): void;
}

/** Part of the viewport where cards are fully readable: not under page copy, not in the faded edges. */
export interface OverlaySafeArea {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  /** Narrow screens show only the highest-priority cards (statusCycles order) to avoid clutter. */
  readonly maxCards: number;
  /** Full viewport size, for elements that may use the whole canvas (tooltip, run cards). */
  readonly width: number;
  readonly height: number;
}

interface CardCycle {
  readonly nodeId: string;
  readonly card: StatusCard;
  readonly anchor: Point;
  readonly states: WorldGraph["statusCycles"][number]["states"];
  index: number;
  elapsed: number;
  delay: number;
  shown: boolean;
}

/**
 * The district. Layers, back to front:
 *   static render group (ground, shadows, flow lines) — built once, never re-batched;
 *   moving data pulses and arrival rings;
 *   depth-sorted entities (buildings, trees, vans) — all baked sprites;
 *   arcs in the air, then highlighted packets (hero request, playground runs);
 *   screen-space overlay (status cards, hover tooltip).
 * Focus mode adds two small render groups: highlighted links and rings on the ground (under the
 * buildings) and highlighted arcs in the air.
 */
export function createCityView(
  graph: WorldGraph,
  theme: SceneTheme,
  options: CityViewOptions,
  renderer: Renderer,
): CityView {
  const { colors } = theme;
  const animated = options.motion === "full";
  const baker = new TextureBaker(renderer);

  // The camera moves `world` as a whole; as a render group that is one GPU transform, not one per child.
  const world = new Container({ label: "city", isRenderGroup: true });
  const overlay = new Container({ label: "city-overlay" });
  const shadowTexture = createSoftShadowTexture();
  const linkPaths = createLinkPaths(graph);

  const decor = planDecor(graph);
  const buildings = [...graph.nodes, ...decor.fillers];

  const ground = drawGround(graph, buildings, colors);
  const shadows = createGroundPlane(PLATE_HEIGHT);
  for (const node of buildings) {
    shadows.tiles.addChild(
      createFootprintShadow(
        shadowTexture,
        node.tile.x + 0.18,
        node.tile.y - 0.08,
        node.footprint.width + 0.2,
        node.footprint.depth + 0.2,
        0.17,
      ),
    );
  }

  const flows: FlowNetwork = createFlowNetwork(
    graph,
    colors,
    { animated: animated && options.particles },
    baker,
  );
  const staticLayer = new Container({ label: "static", isRenderGroup: true });
  staticLayer.addChild(ground, shadows.plane, flows.lines);

  // Buildings, trees and vans share one depth-sorted layer of baked sprites.
  const entities = new Container({ label: "entities", sortableChildren: true });
  const gradients: FillGradient[] = [];
  const quietColors = backgroundPalette(colors);
  const buildingSprites = new Map<string, Sprite>();
  const scenery: Sprite[] = [];
  for (const [node, palette, system] of [
    ...graph.nodes.map((node) => [node, colors, true] as const),
    ...decor.fillers.map((node) => [node, quietColors, false] as const),
  ]) {
    const building = createBuilding(node, palette);
    gradients.push(...building.gradients);
    const sprite = baker.fromGraphics(building.view).createSprite();
    sprite.zIndex = building.view.zIndex;
    entities.addChild(sprite);
    if (system) buildingSprites.set(node.id, sprite);
    else scenery.push(sprite);
  }

  const treeContexts: GraphicsContext[] = createTreeContexts(colors);
  const treeArts = treeContexts.map((context) => baker.fromContext(context));
  for (const tree of decor.trees) {
    const art = treeArts[Math.min(tree.size, TREE_SIZES.length - 1)];
    if (!art) continue;
    const sprite = art.createSprite();
    const position = tileToWorld(tree.x, tree.y);
    sprite.position.set(position.x, position.y - PLATE_HEIGHT);
    sprite.zIndex = depthKey(tree.x, tree.y);
    entities.addChild(sprite);
    scenery.push(sprite);
  }

  const traffic: Traffic = createTraffic(graph, colors, entities, baker);
  const highlights = new Container({ label: "highlights" });
  const journey: RequestJourneyView | null =
    animated && graph.heroJourney
      ? createRequestJourney(
          graph,
          graph.heroJourney,
          theme,
          { ground: flows.particles, highlight: highlights },
          baker,
          shadowTexture,
        )
      : null;
  // Ambient cards (the hero story and the status cycles) fade back together in focus mode.
  const ambientCards = new Container({ label: "ambient-cards" });
  overlay.addChild(ambientCards);
  if (journey) ambientCards.addChild(journey.card.view);

  const runs = createRunVisualizer({
    graph,
    theme,
    baker,
    linkPaths,
    layers: { ground: flows.particles, highlight: highlights },
    overlay,
    shadowTexture,
  });

  const focusGround = new Container({
    label: "focus-ground",
    isRenderGroup: true,
  });
  const focusAir = new Container({ label: "focus-air", isRenderGroup: true });
  const focus = createNodeFocus({
    graph,
    colors,
    targets: {
      buildings: buildingSprites,
      scenery,
      layers: [flows.lines, flows.arcs, flows.particles, ambientCards],
      traffic,
    },
    layers: { ground: focusGround, air: focusAir },
  });

  // The send point's ring: ground level, under the buildings, its own render group like focus.
  const beaconLayer = new Container({ label: "beacon", isRenderGroup: true });
  const beacon = createNodeBeacon({
    graph,
    colors,
    layer: beaconLayer,
    animated,
  });

  world.addChild(
    staticLayer,
    beaconLayer,
    focusGround,
    flows.particles,
    entities,
    flows.arcs,
    focusAir,
    highlights,
  );

  const hitAreas = createNodeHitAreas(graph.nodes, PLATE_HEIGHT);

  // Names sit under every card in the overlay; a building with a card shows the card instead.
  const nameTagLayer = new Container({ label: "name-tags" });
  overlay.addChildAt(nameTagLayer, 0);
  const nameTags = graph.nameTags
    ? graph.nodes.map((node) => {
        const tag = new NameTag(theme, node.label);
        nameTagLayer.addChild(tag.view);
        const center = tileToWorld(nodeCenter(node).x, nodeCenter(node).y);
        return {
          nodeId: node.id,
          tag,
          anchor: new Point(
            center.x,
            center.y - PLATE_HEIGHT - node.height - NAME_TAG_LIFT,
          ),
        };
      })
    : [];
  let focusedNodes: ReadonlySet<string> = new Set();

  const tooltip = new NodeTooltip(theme, shadowTexture);
  overlay.addChild(tooltip.view);
  const tooltipAnchor = new Point();
  let tooltipNodeId: string | null = null;

  // Ambient status cards above buildings, cycling through their scripted states.
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const cycles: CardCycle[] = graph.statusCycles.flatMap((cycle, index) => {
    const node = nodesById.get(cycle.node);
    const first = cycle.states[0];
    if (!node || !first) return [];
    const center = tileToWorld(nodeCenter(node).x, nodeCenter(node).y);
    const card = new StatusCard(theme, shadowTexture, node.label);
    card.setState(first.status, first.text);
    ambientCards.addChild(card.view);
    if (!animated) card.show(true);
    return [
      {
        nodeId: node.id,
        card,
        anchor: new Point(
          center.x,
          center.y - PLATE_HEIGHT - node.height - CARD_LIFT,
        ),
        states: cycle.states,
        index: 0,
        elapsed: 0,
        delay: CARD_FIRST_DELAY_MS + index * CARD_STAGGER_MS,
        shown: !animated,
      },
    ];
  });

  let playground = false;
  let playerConnected = false;
  /** A send point is ringed: the page's bubble over it is the call to action, ambient cards wait. */
  let beaconSet = false;
  const screenPoint = new Point();
  const overhang =
    Math.max(...graph.nodes.map((node) => node.height)) + PLATE_HEIGHT + 60;
  const viewBounds = new Map(
    Object.entries(graph.views).map(([id, spec]) => [
      id,
      tileAreaBounds(spec.area, overhang),
    ]),
  );
  let view = "system";

  /**
   * Ambient cards that would cross the safe area are hidden (the scene's edges fade out). Run cards
   * are content: while their building is in view they are pushed inside instead.
   */
  function placeCard(
    card: StatusCard,
    anchor: Point,
    safeArea: OverlaySafeArea,
    allowed: boolean,
    keepInside = false,
  ): void {
    world.toGlobal(anchor, screenPoint);
    let x = Math.round(screenPoint.x);
    let y = Math.round(screenPoint.y);
    const { width, height } = card.size;
    if (keepInside) {
      const anchorInView =
        x >= 0 && x <= safeArea.width && y >= 0 && y <= safeArea.height;
      x = Math.round(
        Math.min(
          Math.max(x, safeArea.left + width / 2),
          safeArea.right - width / 2,
        ),
      );
      y = Math.round(Math.max(y, safeArea.top + height));
      card.view.position.set(x, y);
      card.view.visible = allowed && anchorInView;
      return;
    }
    card.view.position.set(x, y);
    card.view.visible =
      allowed &&
      x - width / 2 >= safeArea.left &&
      x + width / 2 <= safeArea.right &&
      y - height >= safeArea.top &&
      y <= safeArea.bottom;
  }

  /** The tooltip may use the whole canvas: it is clamped inside instead of hidden. */
  function placeTooltip(safeArea: OverlaySafeArea): void {
    if (!tooltipNodeId) return;
    world.toGlobal(tooltipAnchor, screenPoint);
    const halfWidth = tooltip.size.width / 2;
    const x = Math.min(
      Math.max(screenPoint.x, halfWidth + TOOLTIP_EDGE),
      safeArea.width - halfWidth - TOOLTIP_EDGE,
    );
    const y = Math.max(screenPoint.y, tooltip.size.height + TOOLTIP_EDGE);
    tooltip.view.position.set(Math.round(x), Math.round(y));
  }

  /** Ambient cards and the hero story step aside while the playground drives the city. */
  function setPlayground(next: boolean): void {
    playground = next;
    journey?.setActive(!next);
    for (const cycle of cycles) {
      if (next) {
        cycle.card.hide();
      } else {
        cycle.shown = !animated;
        cycle.delay = CARD_FIRST_DELAY_MS;
        if (!animated) cycle.card.show(true);
      }
    }
  }

  return {
    world,
    overlay,
    get focusBounds() {
      const bounds = viewBounds.get(view);
      if (!bounds) throw new Error(`Unknown scene view "${view}"`);
      return bounds;
    },
    get view() {
      return view;
    },
    setView(next, immediate) {
      const spec = graph.views[next];
      if (!spec) {
        console.error(
          `[stage] Unknown scene view "${next}"; the camera stays.`,
        );
        return;
      }
      view = next;
      focus.setEmphasis(spec.nodes ?? null, immediate);
    },
    get dynamicOverlay() {
      return playerConnected;
    },
    pickNode(screenX, screenY) {
      const scale = world.scale.x;
      if (scale <= 0) return null;
      return pickNode(
        hitAreas,
        (screenX - world.position.x) / scale,
        (screenY - world.position.y) / scale,
      );
    },
    setFocus(nodeIds, immediate) {
      focus.setFocus(nodeIds, immediate);
      focusedNodes = new Set(nodeIds);
    },
    setTooltip(nodeId) {
      const node = nodeId ? nodesById.get(nodeId) : undefined;
      tooltipNodeId = node ? node.id : null;
      tooltip.view.visible = node !== undefined;
      if (!node) return;
      // Run cards are added to the overlay on demand; the tooltip stays above them.
      overlay.addChild(tooltip.view);
      tooltip.setContent(node.label, node.tech);
      const center = nodeCenter(node);
      const ground = tileToWorld(center.x, center.y);
      tooltipAnchor.set(
        ground.x,
        ground.y - PLATE_HEIGHT - node.height - TOOLTIP_LIFT,
      );
    },
    setBeacon(nodeId) {
      beacon.set(nodeId);
      beaconSet = nodeId !== null && nodesById.has(nodeId);
    },
    nodeAnchor(nodeId) {
      const node = nodesById.get(nodeId);
      if (!node) return null;
      const center = nodeCenter(node);
      const ground = tileToWorld(center.x, center.y);
      return {
        x: ground.x,
        y: ground.y - PLATE_HEIGHT - node.height - NAME_TAG_LIFT,
      };
    },
    update(deltaMs, ambient) {
      runs.update(deltaMs);
      focus.update(deltaMs);
      beacon.update(deltaMs);
      if (!ambient) return;
      flows.update(deltaMs);
      traffic.update(deltaMs);
      journey?.update(deltaMs);

      for (const cycle of cycles) {
        cycle.card.update(deltaMs);
        if (playground) continue;
        if (!cycle.shown) {
          cycle.delay -= deltaMs;
          if (cycle.delay <= 0) {
            cycle.shown = true;
            cycle.card.show(false);
          }
        } else if (cycle.states.length > 1) {
          cycle.elapsed += deltaMs;
          const current = cycle.states[cycle.index];
          if (current && cycle.elapsed >= current.durationMs) {
            cycle.elapsed = 0;
            cycle.index = (cycle.index + 1) % cycle.states.length;
            const next = cycle.states[cycle.index];
            if (next) cycle.card.setState(next.status, next.text);
          }
        }
      }
    },
    syncOverlay(safeArea) {
      // A run's own card on a node replaces the ambient one there.
      cycles.forEach((cycle, index) =>
        placeCard(
          cycle.card,
          cycle.anchor,
          safeArea,
          !playground &&
            !beaconSet &&
            index < safeArea.maxCards &&
            runs.cards.get(cycle.nodeId)?.visible !== true,
        ),
      );
      // The hero request's result is the main story: it is never dropped for clutter.
      if (journey)
        placeCard(journey.card, journey.cardAnchor, safeArea, !playground);
      for (const entry of runs.cards.values())
        placeCard(entry.card, entry.anchor, safeArea, true, true);
      for (const { nodeId, tag, anchor } of nameTags) {
        world.toGlobal(anchor, screenPoint);
        const x = Math.round(screenPoint.x);
        const y = Math.round(screenPoint.y);
        const runCard = runs.cards.get(nodeId);
        // A run card fading out still covers the name, so the two never overlap.
        const covered =
          (runCard !== undefined &&
            (runCard.visible || runCard.card.view.alpha > 0.02)) ||
          cycles.some(
            (cycle) => cycle.nodeId === nodeId && cycle.card.view.visible,
          ) ||
          nodeId === tooltipNodeId;
        tag.view.position.set(x, y);
        tag.view.visible =
          !covered &&
          x - tag.size.width / 2 >= 0 &&
          x + tag.size.width / 2 <= safeArea.width &&
          y - tag.size.height >= 0 &&
          y <= safeArea.height;
        tag.view.alpha =
          focusedNodes.size === 0 || focusedNodes.has(nodeId)
            ? 1
            : NAME_TAG_DIMMED;
      }
      runs.setViewScale(world.scale.x);
      placeTooltip(safeArea);
    },
    setDetailResolution(resolution, force = false) {
      if (force || baker.needsBake(resolution)) baker.bake(resolution);
    },
    connectPlayer(player, mode) {
      playerConnected = true;
      if (mode === "playground") setPlayground(true);
      else journey?.setActive(false);
      const disconnect = runs.connect(player);
      return () => {
        disconnect();
        playerConnected = false;
        if (mode === "playground") setPlayground(false);
        else journey?.setActive(true);
      };
    },
    destroy() {
      // Textures and Graphics wrappers first, then the views and the shared geometry they used.
      baker.destroy();
      for (const cycle of cycles) cycle.card.destroy();
      for (const { tag } of nameTags) tag.destroy();
      tooltip.destroy();
      focus.destroy();
      beacon.destroy();
      journey?.destroy();
      runs.destroy();
      traffic.destroy();
      flows.destroy();
      world.destroy({ children: true });
      overlay.destroy({ children: true });
      for (const context of treeContexts) context.destroy();
      for (const gradient of gradients) gradient.destroy();
      shadowTexture.destroy(true);
    },
  };
}

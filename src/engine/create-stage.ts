import { Application, Point, type Container, type Ticker } from "pixi.js";

import { worldGraphs, type WorldId } from "@/simulation/graphs/worlds";

import { fitContain, type Framing } from "./camera/fit";
import {
  NO_INSETS,
  resolveFocusInsets,
  type FocusInsets,
} from "./camera/focus-inset";
import { easeInOutCubic, FLIGHT_MS, interpolateFraming } from "./camera/flight";
import { PointerParallax } from "./camera/parallax";
import { readDeviceProfile } from "./core/device-profile";
import { FrameMonitor } from "./core/frame-monitor";
import {
  detectQualityTier,
  downgradeTier,
  frameBudgetMs,
  qualityTiers,
  resolveResolution,
  type QualityTierName,
} from "./core/quality";
import type { DebugOverlay } from "./debug/debug-overlay";
import { PointerInput } from "./input/pointer-input";
import { readSceneTheme, type SceneTheme } from "./theme/scene-theme";
import {
  FOCUS_INSET_ATTRIBUTES,
  LARGE_SCREEN_QUERY,
  type NodeAnchor,
  type PlayerHandle,
  type PlayerMode,
  type StageEvent,
  type StageOptions,
  type StageRuntime,
} from "./types";
import {
  createCityView,
  type CityView,
  type OverlaySafeArea,
} from "./world/city-view";

/** Delta clamp: after a stall (tab switch, GC pause) a frame never advances more than 100 ms. */
const MIN_FPS = 10;
/** Never zoom the city past 1:1, so large screens show more city instead of blurrier detail. */
const MAX_SCALE = 1;
const PARALLAX_PX = 10;
/** Card-free margins, as shares of the viewport (the CSS mask feathers the edges). */
const CARD_EDGE_X = 0.05;
const CARD_EDGE_Y = 0.1;
const NARROW_VIEWPORT_PX = 640;
const REBAKE_DEBOUNCE_MS = 180;
const FONT_TIMEOUT_MS = 2500;

/**
 * Pixi documents `setTargetElement(null)` as "remove all event bindings", but its typings only
 * accept an element; this view of the event system states the documented contract.
 */
interface DetachableEventSystem {
  setTargetElement(element: HTMLElement | null): void;
}

async function loadDebugOverlay(
  stage: Container,
  snapshot: ConstructorParameters<typeof DebugOverlay>[1],
) {
  const { DebugOverlay } = await import("./debug/debug-overlay");
  return new DebugOverlay(stage, snapshot);
}

/** Canvas text is rasterized once, so the web font must be ready first; a slow font falls back after a timeout. */
async function waitForFonts(theme: SceneTheme): Promise<void> {
  const loads = Promise.all([
    document.fonts.load(`700 13px ${theme.fonts.sans}`),
    document.fonts.load(`600 13px ${theme.fonts.sans}`),
  ]);
  const timeout = new Promise<"timeout">((resolve) =>
    window.setTimeout(() => resolve("timeout"), FONT_TIMEOUT_MS),
  );
  try {
    if ((await Promise.race([loads, timeout])) === "timeout") {
      console.warn(
        "[stage] Web font is slow to load; scene labels use the fallback font.",
      );
    }
  } catch (error) {
    console.warn(
      "[stage] Web font failed to load; scene labels use the fallback font.",
      error,
    );
  }
}

/**
 * Entry point of the engine chunk. Loaded with a dynamic import from features/stage,
 * so PixiJS never runs during SSR and never blocks the first paint.
 */
export async function createStage({
  motion,
  world: initialWorld,
}: StageOptions): Promise<StageRuntime> {
  const profile = readDeviceProfile();
  let tierName: QualityTierName = detectQualityTier(profile);
  const initialTier = qualityTiers[tierName];
  const theme = readSceneTheme();

  const app = new Application();
  await Promise.all([
    app.init({
      preference: "webgl",
      backgroundAlpha: 0,
      antialias: initialTier.antialias,
      resolution: resolveResolution(initialTier, profile.devicePixelRatio),
      autoDensity: true,
      autoStart: false,
      width: 1,
      height: 1,
    }),
    waitForFonts(theme),
  ]);

  const canvas = app.canvas;
  canvas.style.display = "block";
  // The scene reads input through PointerInput. Pixi's own event system would set
  // touch-action: none on the canvas (no page scrolling over the scene on phones) and hit-test
  // the whole stage every frame, so it is detached.
  const pixiEvents: DetachableEventSystem = app.renderer.events;
  pixiEvents.setTargetElement(null);
  app.ticker.minFPS = MIN_FPS;
  app.ticker.maxFPS = initialTier.maxFps;

  function buildWorld(id: WorldId): CityView {
    return createCityView(
      worldGraphs[id],
      theme,
      { motion, particles: tierName !== "low" },
      app.renderer,
    );
  }

  /** The world on screen. The city is kept when a case world replaces it; case worlds are rebuilt. */
  let worldId: WorldId = initialWorld;
  let city = buildWorld(initialWorld);
  let cachedCity: CityView | null = null;
  // Worlds sit under the debug overlay, which is added to the stage later.
  app.stage.addChildAt(city.world, 0);
  app.stage.addChildAt(city.overlay, 1);

  const parallax =
    motion === "full" && !profile.coarsePointer && tierName !== "low"
      ? new PointerParallax(PARALLAX_PX)
      : null;
  const monitor = new FrameMonitor({ budgetMs: frameBudgetMs(initialTier) });
  const debugOverlay =
    process.env.NODE_ENV !== "production" &&
    new URLSearchParams(window.location.search).has("debug")
      ? await loadDebugOverlay(app.stage, () => ({
          tier: tierName,
          resolution: app.renderer.resolution,
          renderer: app.renderer.name,
        }))
      : null;

  const largeScreen = window.matchMedia(LARGE_SCREEN_QUERY);
  let container: HTMLElement | null = null;
  let size = { width: 0, height: 0 };
  let framing: Framing = { scale: 1, offsetX: 0, offsetY: 0 };
  /** A camera flight to a new view in progress. */
  let flight: { from: Framing; to: Framing; elapsed: number } | null = null;
  let visible = false;
  let contextLost = false;
  /** The page's player: drawn by whichever world is on screen. */
  let connection: {
    readonly player: PlayerHandle;
    readonly mode: PlayerMode;
    disconnect: () => void;
  } | null = null;

  /** The send point ringed on the ground (re-applied to every world that comes on screen). */
  let beaconNodeId: string | null = null;
  /** Page content pinned to buildings (see StageRuntime.trackNode). */
  const trackers = new Set<{
    readonly nodeId: string;
    readonly listener: (anchor: NodeAnchor | null) => void;
    last: NodeAnchor | null;
  }>();
  const trackerPoint = new Point();

  // Focus sources, strongest first: the page's preview, the pointer's hover, the selection.
  let previewNodeIds: readonly string[] = [];
  let hoveredNodeId: string | null = null;
  let selectedNodeId: string | null = null;
  const listeners = new Set<(event: StageEvent) => void>();

  function emit(event: StageEvent): void {
    for (const listener of listeners) listener(event);
  }

  function renderIfIdle(): void {
    if (container && !app.ticker.started && !contextLost) app.render();
  }

  /** Cards stay out of the page content's insets and the feathered edges (see the hero's CSS mask). */
  function overlaySafeArea(): OverlaySafeArea {
    const { width, height } = size;
    const insets = focusInsets();
    return {
      left: Math.max(insets.left, width * CARD_EDGE_X),
      top: Math.max(insets.top, height * CARD_EDGE_Y),
      right: Math.min(width - insets.right, width * (1 - CARD_EDGE_X)),
      bottom: Math.min(height - insets.bottom, height * (1 - CARD_EDGE_Y)),
      maxCards: width < NARROW_VIEWPORT_PX ? 2 : Number.POSITIVE_INFINITY,
      width,
      height,
    };
  }

  /** Recomputed on layout only; per-frame overlay syncs reuse it. */
  let safeArea: OverlaySafeArea = overlaySafeArea();

  function applyCamera(): void {
    city.world.scale.set(framing.scale);
    city.world.position.set(
      framing.offsetX + (parallax?.x ?? 0),
      framing.offsetY + (parallax?.y ?? 0),
    );
    city.syncOverlay(safeArea);
    syncTrackers(false);
  }

  /** Tells pinned page content where its building is now (only when it moved or appeared). */
  function syncTrackers(force: boolean): void {
    for (const tracker of trackers) {
      const point = container ? city.nodeAnchor(tracker.nodeId) : null;
      let anchor: NodeAnchor | null = null;
      if (point) {
        city.world.toGlobal(point, trackerPoint);
        anchor = { x: trackerPoint.x, y: trackerPoint.y };
      }
      const { last } = tracker;
      const moved =
        anchor === null || last === null
          ? anchor !== last
          : Math.abs(anchor.x - last.x) > 0.5 ||
            Math.abs(anchor.y - last.y) > 0.5;
      if (!moved && !force) continue;
      tracker.last = anchor;
      tracker.listener(anchor);
    }
  }

  /** Space page content covers on each side; only on large screens, where content overlaps. */
  function focusInsets(): FocusInsets {
    const slot = container;
    if (!slot || !largeScreen.matches) return NO_INSETS;
    return resolveFocusInsets(
      (side) => slot.getAttribute(FOCUS_INSET_ATTRIBUTES[side]),
      size,
    );
  }

  function syncFocus(): void {
    const focused =
      previewNodeIds.length > 0
        ? previewNodeIds
        : hoveredNodeId
          ? [hoveredNodeId]
          : selectedNodeId
            ? [selectedNodeId]
            : [];
    // Without a running loop nobody would advance the fade.
    city.setFocus(focused, motion === "reduced" || !app.ticker.started);
    city.setTooltip(
      hoveredNodeId ??
        (previewNodeIds.length === 1 ? previewNodeIds[0]! : null),
    );
    canvas.style.cursor = hoveredNodeId ? "pointer" : "";
    applyCamera();
    renderIfIdle();
  }

  const input = new PointerInput(canvas, {
    hover(x, y) {
      setHovered(city.pickNode(x, y));
    },
    hoverEnd() {
      setHovered(null);
    },
    tap(x, y) {
      emit({ type: "nodeSelected", nodeId: city.pickNode(x, y) });
    },
  });

  function setHovered(nodeId: string | null): void {
    if (nodeId === hoveredNodeId) return;
    hoveredNodeId = nodeId;
    syncFocus();
    emit({ type: "nodeHovered", nodeId });
  }

  let bakeTimer: number | undefined;
  let baked = false;

  /** Art is baked at the size it is shown: device resolution × camera zoom. */
  function refreshDetail({
    immediate,
    force = false,
  }: {
    immediate: boolean;
    force?: boolean;
  }): void {
    window.clearTimeout(bakeTimer);
    const bake = () => {
      city.setDetailResolution(app.renderer.resolution * framing.scale, force);
      renderIfIdle();
    };
    // While a window is being resized, keep the old textures and re-bake once it settles.
    if (immediate) bake();
    else bakeTimer = window.setTimeout(bake, REBAKE_DEBOUNCE_MS);
  }

  function targetFraming(): Framing {
    return fitContain(city.focusBounds, size, {
      maxScale: MAX_SCALE,
      insets: focusInsets(),
    });
  }

  /** The flight pivots around the centre of the part of the viewport the scene owns. */
  function flightPivot(): { x: number; y: number } {
    const insets = focusInsets();
    return {
      x: insets.left + (size.width - insets.left - insets.right) / 2,
      y: insets.top + (size.height - insets.top - insets.bottom) / 2,
    };
  }

  /**
   * Whether the slot is on screen right now. Right after an attach (a page navigation) the
   * IntersectionObserver has not reported yet, so the ticker may still be stopped.
   */
  function onScreen(): boolean {
    if (!container || document.hidden) return false;
    const rect = container.getBoundingClientRect();
    return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  /** Moves the camera to the current view: a flight when someone is watching, a cut otherwise. */
  function frameView(): void {
    const target = targetFraming();
    if (motion === "reduced" || !onScreen()) {
      flight = null;
      framing = target;
      applyCamera();
      refreshDetail({ immediate: true });
      renderIfIdle();
      return;
    }
    // Zooming in: bake for the closer view up front, so the art is never stretched on the way.
    if (target.scale > framing.scale)
      city.setDetailResolution(app.renderer.resolution * target.scale);
    flight = { from: framing, to: target, elapsed: 0 };
  }

  /** Page content moved over the scene (a panel slid away): fly to the new free area. */
  function reframe(): void {
    if (!container || size.width <= 0 || !baked) return;
    safeArea = overlaySafeArea();
    frameView();
  }

  function layout(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    size = { width, height };
    app.renderer.resize(width, height);
    const target = targetFraming();
    if (flight) flight.to = target;
    else framing = target;
    safeArea = overlaySafeArea();
    applyCamera();
    refreshDetail({ immediate: !baked });
    baked = true;
    renderIfIdle();
  }

  /**
   * Runs the loop only while someone can see the result. With reduced motion the ambient city is
   * still; a connected playground keeps the loop running, because its packets are the content.
   */
  function syncTicker(): void {
    const shouldRun =
      container !== null &&
      visible &&
      !document.hidden &&
      !contextLost &&
      (motion === "full" || connection !== null);
    if (shouldRun && !app.ticker.started) app.ticker.start();
    if (!shouldRun && app.ticker.started) app.ticker.stop();
  }

  function applyTier(next: QualityTierName): void {
    if (next === tierName) return;
    tierName = next;
    const tier = qualityTiers[next];
    app.ticker.maxFPS = tier.maxFps;
    app.renderer.resize(
      size.width,
      size.height,
      resolveResolution(tier, profile.devicePixelRatio),
    );
    monitor.reset(frameBudgetMs(tier));
    refreshDetail({ immediate: true });
  }

  /** Advances a camera flight; true while the camera moved this frame. */
  function advanceFlight(deltaMs: number): boolean {
    if (!flight) return false;
    flight.elapsed += deltaMs;
    const progress = Math.min(1, flight.elapsed / FLIGHT_MS);
    framing = interpolateFraming(
      flight.from,
      flight.to,
      easeInOutCubic(progress),
      flightPivot(),
    );
    if (progress === 1) {
      framing = flight.to;
      flight = null;
      refreshDetail({ immediate: true });
    }
    return true;
  }

  /**
   * Puts another world on screen. Pages own their worlds, so this happens on navigation: the camera
   * cuts to the new view (there is nothing to fly between) and the art is baked for it right away.
   */
  function enterWorld(next: WorldId, view: string): void {
    connection?.disconnect();
    app.stage.removeChild(city.world, city.overlay);
    if (worldId === "city") cachedCity = city;
    else city.destroy();
    city =
      next === "city" ? (cachedCity ?? buildWorld("city")) : buildWorld(next);
    worldId = next;
    app.stage.addChildAt(city.world, 0);
    app.stage.addChildAt(city.overlay, 1);
    city.setView(view, true);
    city.setBeacon(beaconNodeId);
    if (connection)
      connection.disconnect = city.connectPlayer(
        connection.player,
        connection.mode,
      );
    hoveredNodeId = null;
    flight = null;
    canvas.style.cursor = "";
    if (container && size.width > 0) {
      framing = targetFraming();
      refreshDetail({ immediate: true, force: true });
    }
    syncFocus();
    syncTrackers(true);
  }

  function tick(ticker: Ticker): void {
    city.update(ticker.deltaMS, motion === "full");
    const flying = advanceFlight(ticker.deltaMS);
    if (parallax?.update(ticker.deltaMS) || flying || city.dynamicOverlay)
      applyCamera();
    debugOverlay?.sample(ticker.deltaMS);
    if (monitor.sample(ticker.deltaMS)) applyTier(downgradeTier(tierName));
  }
  app.ticker.add(tick);

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries.at(-1);
    if (entry)
      layout(
        Math.round(entry.contentRect.width),
        Math.round(entry.contentRect.height),
      );
  });

  const insetObserver = new MutationObserver(reframe);

  const intersectionObserver = new IntersectionObserver((entries) => {
    const entry = entries.at(-1);
    visible = entry?.isIntersecting ?? false;
    syncTicker();
  });

  // PixiJS restores GPU resources itself; the stage only pauses while the context is gone.
  function handleContextLost(): void {
    contextLost = true;
    syncTicker();
  }
  function handleContextRestored(): void {
    contextLost = false;
    // Baked render textures lose their pixels with the context; vector sources are still in memory.
    refreshDetail({ immediate: true, force: true });
    syncTicker();
    renderIfIdle();
  }

  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);
  document.addEventListener("visibilitychange", syncTicker);

  const runtime: StageRuntime = {
    attach(element) {
      if (container === element) return;
      runtime.detach();
      container = element;
      element.appendChild(canvas);
      debugOverlay?.mount(element);
      parallax?.start();
      resizeObserver.observe(element);
      intersectionObserver.observe(element);
      insetObserver.observe(element, {
        attributeFilter: Object.values(FOCUS_INSET_ATTRIBUTES),
      });
      const rect = element.getBoundingClientRect();
      layout(Math.round(rect.width), Math.round(rect.height));
      syncTicker();
      syncTrackers(true);
    },
    detach() {
      if (!container) return;
      resizeObserver.unobserve(container);
      intersectionObserver.unobserve(container);
      insetObserver.disconnect();
      parallax?.stop();
      canvas.remove();
      debugOverlay?.destroy();
      container = null;
      visible = false;
      setHovered(null);
      syncTicker();
      syncTrackers(false);
    },
    connectPlayer(player, mode) {
      connection?.disconnect();
      const current = {
        player,
        mode,
        disconnect: city.connectPlayer(player, mode),
      };
      connection = current;
      // The mode changes the focus area, so the camera re-frames (and re-bakes if the zoom moved).
      layout(size.width, size.height);
      syncTicker();
      return () => {
        if (connection !== current) return;
        current.disconnect();
        connection = null;
        layout(size.width, size.height);
        syncTicker();
        renderIfIdle();
      };
    },
    send(command) {
      switch (command.type) {
        case "setScene":
          if (command.world !== worldId) {
            enterWorld(command.world, command.view);
            renderIfIdle();
            return;
          }
          if (command.view === city.view) return;
          city.setView(command.view, motion === "reduced" || !onScreen());
          // Without a slot the next attach frames the new view.
          if (container && baked) frameView();
          return;
        case "selectNode":
          selectedNodeId = command.nodeId;
          break;
        case "previewNodes":
          previewNodeIds = command.nodeIds;
          break;
        case "markNode":
          beaconNodeId = command.nodeId;
          city.setBeacon(beaconNodeId);
          renderIfIdle();
          return;
      }
      syncFocus();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    trackNode(nodeId, listener) {
      const tracker = { nodeId, listener, last: null };
      trackers.add(tracker);
      syncTrackers(true);
      return () => {
        trackers.delete(tracker);
      };
    },
    destroy() {
      runtime.detach();
      input.destroy();
      listeners.clear();
      trackers.clear();
      insetObserver.disconnect();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", syncTicker);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      app.ticker.remove(tick);
      window.clearTimeout(bakeTimer);
      connection?.disconnect();
      connection = null;
      city.destroy();
      if (cachedCity !== city) cachedCity?.destroy();
      app.destroy({ removeView: true }, { children: true });
    },
  };

  return runtime;
}

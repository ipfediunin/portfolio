"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";

import type {
  NodeAnchor,
  PlayerHandle,
  PlayerMode,
  SceneRef,
  StageRuntime,
} from "@/engine/types";

import {
  isWebGLAvailable,
  prefersReducedMotion,
  scheduleIdle,
} from "./browser-support";
import {
  createStageStore,
  previewNodes,
  selectNode,
  setHoveredNode,
  type StageSelectionState,
  type StageStore,
} from "./stage-store";

export type StageStatus =
  "idle" | "loading" | "ready" | "unsupported" | "failed";

interface StageContextValue {
  readonly status: StageStatus;
  /** Viewport that currently holds the canvas. */
  readonly activeViewportId: string | null;
  /**
   * Registers a DOM slot for the canvas and the scene it shows (world and camera view); the most
   * recently registered slot is active.
   */
  readonly registerViewport: (
    id: string,
    element: HTMLElement,
    scene: SceneRef,
  ) => () => void;
  /** A slot's scene changed (e.g. another district on the same page): the camera flies there. */
  readonly setViewportScene: (id: string, scene: SceneRef) => void;
  /**
   * Hands a simulation player to the scene. Works before the engine has loaded: the player is
   * connected as soon as the scene is ready. Returns the disconnect function.
   */
  readonly connectPlayer: (
    player: PlayerHandle,
    mode: PlayerMode,
  ) => () => void;
  /** Node selection and preview, shared by the scene, the inspector, the trace and node lists. */
  readonly store: StageStore;
  /**
   * Follows a building on screen for page content pinned to it (see StageRuntime.trackNode).
   * Works before the engine has loaded. Returns the unsubscribe.
   */
  readonly trackNode: (
    nodeId: string,
    listener: (anchor: NodeAnchor | null) => void,
  ) => () => void;
  /** Rings the building the visitor can act from (a demo's send point); null removes the ring. */
  readonly markNode: (nodeId: string | null) => void;
}

interface NodeTracker {
  readonly nodeId: string;
  readonly listener: (anchor: NodeAnchor | null) => void;
  release: (() => void) | null;
}

const StageContext = createContext<StageContextValue | null>(null);

/**
 * Owns the single WebGL scene of the app. Lives in the root layout, so the engine, its context
 * and its textures survive client-side navigation; pages only provide slots (SceneViewport).
 * The engine chunk is downloaded only when the first slot appears.
 */
export function StageProvider({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<StageStatus>("idle");
  const [activeViewportId, setActiveViewportId] = useState<string | null>(null);

  const viewportsRef = useRef(
    new Map<string, { element: HTMLElement; scene: SceneRef }>(),
  );
  const runtimeRef = useRef<StageRuntime | null>(null);
  const loadingRef = useRef(false);
  /** Bumped on unmount: async work started by an older mount must not touch the new one. */
  const generationRef = useRef(0);
  const playerRef = useRef<{
    readonly player: PlayerHandle;
    readonly mode: PlayerMode;
  } | null>(null);
  const disconnectPlayerRef = useRef<(() => void) | null>(null);
  const trackersRef = useRef(new Set<NodeTracker>());
  const beaconRef = useRef<string | null>(null);
  const [store] = useState(createStageStore);

  /** Hands waiting trackers and the beacon to a runtime that has just become ready. */
  const syncPinned = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    for (const tracker of trackersRef.current)
      tracker.release ??= runtime.trackNode(tracker.nodeId, tracker.listener);
    runtime.send({ type: "markNode", nodeId: beaconRef.current });
  }, []);

  const trackNode = useCallback(
    (nodeId: string, listener: (anchor: NodeAnchor | null) => void) => {
      const tracker: NodeTracker = {
        nodeId,
        listener,
        release: runtimeRef.current?.trackNode(nodeId, listener) ?? null,
      };
      trackersRef.current.add(tracker);
      return () => {
        tracker.release?.();
        trackersRef.current.delete(tracker);
      };
    },
    [],
  );

  const markNode = useCallback((nodeId: string | null) => {
    beaconRef.current = nodeId;
    runtimeRef.current?.send({ type: "markNode", nodeId });
  }, []);

  /** Connects the requested player to a ready runtime (called on request and when the engine arrives). */
  const syncPlayer = useCallback(() => {
    const runtime = runtimeRef.current;
    const request = playerRef.current;
    if (!runtime || !request || disconnectPlayerRef.current) return;
    disconnectPlayerRef.current = runtime.connectPlayer(
      request.player,
      request.mode,
    );
  }, []);

  const connectPlayer = useCallback(
    (player: PlayerHandle, mode: PlayerMode) => {
      disconnectPlayerRef.current?.();
      disconnectPlayerRef.current = null;
      playerRef.current = { player, mode };
      syncPlayer();
      return () => {
        if (playerRef.current?.player !== player) return;
        disconnectPlayerRef.current?.();
        disconnectPlayerRef.current = null;
        playerRef.current = null;
      };
    },
    [syncPlayer],
  );

  const attachActiveViewport = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const active = [...viewportsRef.current].at(-1);
    if (active) {
      const [id, { element, scene }] = active;
      runtime.attach(element);
      runtime.send({ type: "setScene", ...scene });
      setActiveViewportId(id);
    } else {
      runtime.detach();
      setActiveViewportId(null);
    }
  }, []);

  const startEngine = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    if (!isWebGLAvailable()) {
      setStatus("unsupported");
      return;
    }

    setStatus("loading");
    const generation = generationRef.current;

    scheduleIdle(() => {
      if (generation !== generationRef.current) return;

      import("@/engine/create-stage")
        .then(({ createStage }) =>
          createStage({
            motion: prefersReducedMotion() ? "reduced" : "full",
            // The world of the slot that is active by now; a later change is a regular setScene.
            world:
              [...viewportsRef.current.values()].at(-1)?.scene.world ?? "city",
          }),
        )
        .then((runtime) => {
          if (generation !== generationRef.current) {
            runtime.destroy();
            return;
          }
          runtimeRef.current = runtime;
          // Taps select nodes and hovers mark them; the store sends every change back as a command.
          runtime.subscribe((event) => {
            if (event.type === "nodeSelected") selectNode(store, event.nodeId);
            else setHoveredNode(store, event.nodeId);
          });
          const { selectedNodeId, previewNodeIds } = store.getState();
          runtime.send({ type: "selectNode", nodeId: selectedNodeId });
          runtime.send({ type: "previewNodes", nodeIds: previewNodeIds });
          // The first view is set before the first attach, so the scene opens on it without a flight.
          const first = [...viewportsRef.current.values()].at(-1);
          if (first) runtime.send({ type: "setScene", ...first.scene });
          attachActiveViewport();
          syncPlayer();
          syncPinned();
          setStatus("ready");
        })
        .catch((error: unknown) => {
          console.error(
            "[stage] The scene failed to start; the static poster stays visible.",
            error,
          );
          if (generation === generationRef.current) setStatus("failed");
        });
    });
  }, [attachActiveViewport, store, syncPinned, syncPlayer]);

  useEffect(
    () =>
      store.subscribe((state, previous) => {
        const runtime = runtimeRef.current;
        if (!runtime) return;
        if (state.selectedNodeId !== previous.selectedNodeId)
          runtime.send({ type: "selectNode", nodeId: state.selectedNodeId });
        if (state.previewNodeIds !== previous.previewNodeIds)
          runtime.send({ type: "previewNodes", nodeIds: state.previewNodeIds });
      }),
    [store],
  );

  const registerViewport = useCallback(
    (id: string, element: HTMLElement, scene: SceneRef) => {
      viewportsRef.current.set(id, { element, scene });
      startEngine();
      attachActiveViewport();

      return () => {
        viewportsRef.current.delete(id);
        attachActiveViewport();
      };
    },
    [attachActiveViewport, startEngine],
  );

  const setViewportScene = useCallback((id: string, scene: SceneRef) => {
    const viewport = viewportsRef.current.get(id);
    if (
      !viewport ||
      (viewport.scene.world === scene.world &&
        viewport.scene.view === scene.view)
    )
      return;
    viewport.scene = scene;
    if ([...viewportsRef.current.keys()].at(-1) === id)
      runtimeRef.current?.send({ type: "setScene", ...scene });
  }, []);

  useEffect(() => {
    const generation = generationRef;
    const runtime = runtimeRef;
    const loading = loadingRef;
    const disconnectPlayer = disconnectPlayerRef;
    const trackers = trackersRef;
    return () => {
      generation.current += 1;
      disconnectPlayer.current = null;
      for (const tracker of trackers.current) tracker.release = null;
      runtime.current?.destroy();
      runtime.current = null;
      loading.current = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      status,
      activeViewportId,
      registerViewport,
      setViewportScene,
      connectPlayer,
      store,
      trackNode,
      markNode,
    }),
    [
      status,
      activeViewportId,
      registerViewport,
      setViewportScene,
      connectPlayer,
      store,
      trackNode,
      markNode,
    ],
  );

  return <StageContext value={value}>{children}</StageContext>;
}

export function useStage(): StageContextValue {
  const context = useContext(StageContext);
  if (!context) throw new Error("useStage must be used inside <StageProvider>");
  return context;
}

export function useStageSelection<T>(
  selector: (state: StageSelectionState) => T,
): T {
  return useStore(useStage().store, selector);
}

/** Stable actions for components that point at nodes (inspector, node list, trace rows). */
export function useNodeActions() {
  const { store } = useStage();
  return useMemo(
    () => ({
      select: (nodeId: string | null) => selectNode(store, nodeId),
      preview: (nodeIds: readonly string[]) => previewNodes(store, nodeIds),
    }),
    [store],
  );
}

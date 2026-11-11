"use client";

import { useCallback, useEffect, useRef } from "react";

import type { PlayerMode } from "@/engine/types";
import { useStage } from "@/features/stage/stage-provider";

import type { ScenePlayback } from "./playback-clock";

/** After the last run ends, its status cards stay this long before the scene is handed back. */
const IDLE_AFTER_MS = 3200;

/**
 * Lends the scene to a controller's runs on top of the current view: call the returned function
 * before sending. "visitor" keeps the view as it is (the hero story only pauses); "playground"
 * also clears the ambient status cards, for demos whose cards are the content. The player is
 * connected and the clock started on demand, and both are released once the runs are over, so
 * the page's own scene comes back and no frame loop keeps running for nothing.
 */
export function useScenePlayer(
  controller: ScenePlayback,
  mode: PlayerMode = "visitor",
): () => void {
  const { connectPlayer } = useStage();
  const disconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const stopListening = controller.onFrame((time) => {
      if (
        disconnectRef.current &&
        !controller.player.hasPending &&
        time > controller.activeRunEnd + IDLE_AFTER_MS
      ) {
        disconnectRef.current();
        disconnectRef.current = null;
        controller.stop();
      }
    });
    // Stop, not destroy: React may run this effect again with the same controller.
    return () => {
      stopListening();
      disconnectRef.current?.();
      disconnectRef.current = null;
      controller.stop();
    };
  }, [controller]);

  return useCallback(() => {
    disconnectRef.current ??= connectPlayer(controller.player, mode);
    controller.start();
  }, [connectPlayer, controller, mode]);
}

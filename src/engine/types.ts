/** Public contract between the React shell (features/stage) and the engine. No React or PixiJS types here. */

import type { SceneRef, WorldId } from "@/simulation/graphs/worlds";
import type { SimEvent } from "@/simulation/model/events";

export type { SceneRef };

export type MotionPreference = "full" | "reduced";

/**
 * The part of a simulation player the engine needs: a clock to place packets and an event stream.
 * A live backend feed can implement the same shape.
 */
export interface PlayerHandle {
  readonly time: number;
  subscribe(listener: (event: SimEvent) => void): () => void;
}

/**
 * How a connected player uses the city: "playground" frames the whole system and replaces the
 * ambient story; "visitor" sends the hero visitor's own request through the unchanged hero view.
 */
export type PlayerMode = "playground" | "visitor";

/** Commands from the page to the scene. */
export type StageCommand =
  /**
   * World and camera view. Within a world the camera flies to the view; another world replaces the
   * scene at once (a page change, so there is nothing to fly between).
   */
  | ({ readonly type: "setScene" } & SceneRef)
  /** The node shown in the inspector (ring and focus mode), or none. */
  | { readonly type: "selectNode"; readonly nodeId: string | null }
  /** Temporary focus from the page (a hovered trace span, a focused list item); empty clears it. */
  | { readonly type: "previewNodes"; readonly nodeIds: readonly string[] }
  /**
   * A soft pulsing ring on the ground around the building the visitor can act from (a demo's send
   * point), or none. Unlike focus it dims nothing.
   */
  | { readonly type: "markNode"; readonly nodeId: string | null };

/** What the visitor did on the scene itself. */
export type StageEvent =
  /** Tap or click on a building (or on empty ground: null). */
  | { readonly type: "nodeSelected"; readonly nodeId: string | null }
  /** The pointer moved onto a building, or off all of them (null). Never fires for touch. */
  | { readonly type: "nodeHovered"; readonly nodeId: string | null };

export interface StageOptions {
  readonly motion: MotionPreference;
  /** The world built first: the one the first scene slot asks for. */
  readonly world: WorldId;
}

/**
 * Data attributes on a viewport slot: how much of each side page content overlaps on large screens
 * — a share of the axis ("0.3", the hero copy) or pixels ("480px", a case demo's panel). The camera
 * frames the scene in the rest and keeps cards out of the insets; a changed value re-frames it
 * (a short flight, e.g. when a panel slides away).
 */
export const FOCUS_INSET_ATTRIBUTES = {
  top: "data-focus-inset-top-lg",
  right: "data-focus-inset-right-lg",
  bottom: "data-focus-inset-bottom-lg",
  left: "data-focus-inset-lg",
} as const;

/** A focus inset value: a share of the axis (0..1) or pixels. */
export type FocusInsetValue = number | `${number}px`;

/**
 * Where a building's name sits on screen (the top of the building plus a small lift), in CSS
 * pixels from the slot's top-left corner, for page content pinned to it.
 */
export interface NodeAnchor {
  readonly x: number;
  readonly y: number;
}
/** Must match Tailwind's `lg` breakpoint, where the hero places copy over the scene. */
export const LARGE_SCREEN_QUERY = "(min-width: 1024px)";

export interface StageRuntime {
  /** Moves the canvas into `container` and keeps the renderer sized to it. */
  attach(container: HTMLElement): void;
  /** Takes the canvas out of the page and pauses rendering; GPU resources stay alive for the next attach. */
  detach(): void;
  /** Draws the player's runs (see {@link PlayerMode}). Returns a function that disconnects it. */
  connectPlayer(player: PlayerHandle, mode: PlayerMode): () => void;
  send(command: StageCommand): void;
  subscribe(listener: (event: StageEvent) => void): () => void;
  /**
   * Follows a building on screen: `listener` gets its anchor whenever the camera or the world
   * changes it, and null while the world on screen has no such node. Returns the unsubscribe.
   */
  trackNode(
    nodeId: string,
    listener: (anchor: NodeAnchor | null) => void,
  ): () => void;
  destroy(): void;
}

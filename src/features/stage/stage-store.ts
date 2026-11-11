import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * What the page and the scene share about nodes. The store is the source of truth: the scene
 * reports taps into it and receives every change back as a command.
 */
export interface StageSelectionState {
  /** The node open in the inspector. */
  readonly selectedNodeId: string | null;
  /** Nodes the page points at right now (a hovered trace span, a focused list item). */
  readonly previewNodeIds: readonly string[];
  /** The building under the pointer on the scene, so page items about it can light up. */
  readonly hoveredNodeId: string | null;
}

export type StageStore = StoreApi<StageSelectionState>;

export function createStageStore(): StageStore {
  return createStore<StageSelectionState>(() => ({
    selectedNodeId: null,
    previewNodeIds: [],
    hoveredNodeId: null,
  }));
}

export function setHoveredNode(store: StageStore, nodeId: string | null): void {
  if (store.getState().hoveredNodeId !== nodeId)
    store.setState({ hoveredNodeId: nodeId });
}

export function selectNode(store: StageStore, nodeId: string | null): void {
  if (store.getState().selectedNodeId !== nodeId)
    store.setState({ selectedNodeId: nodeId });
}

export function previewNodes(
  store: StageStore,
  nodeIds: readonly string[],
): void {
  const current = store.getState().previewNodeIds;
  const same =
    current.length === nodeIds.length &&
    current.every((nodeId, index) => nodeId === nodeIds[index]);
  if (!same) store.setState({ previewNodeIds: nodeIds });
}

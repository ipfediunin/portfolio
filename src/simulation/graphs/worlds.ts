import { botsIntegrationsGraph } from "../cases/bots-integrations/graph";
import { corporateMessengerGraph } from "../cases/corporate-messenger/graph";
import { dataInfrastructureGraph } from "../cases/data-infrastructure/graph";
import { eventDrivenGraph } from "../cases/event-driven/graph";
import { knowledgeBaseGraph } from "../cases/knowledge-base/graph";
import { processAutomationGraph } from "../cases/process-automation/graph";
import { scientificDataGraph } from "../cases/scientific-data/graph";
import { webApplicationsGraph } from "../cases/web-applications/graph";
import {
  sceneViewIds,
  type SceneViewId,
  type WorldGraph,
} from "../model/graph";
import { cityGraph } from "./city";

/**
 * Every world the scene can show: the city, and one small system per case study. The engine builds
 * a world when a page first asks for it; the city stays cached, a case world is dropped on leaving.
 */
export const worldGraphs = {
  city: cityGraph,
  "knowledge-base": knowledgeBaseGraph,
  "scientific-data": scientificDataGraph,
  "process-automation": processAutomationGraph,
  "corporate-messenger": corporateMessengerGraph,
  "event-driven": eventDrivenGraph,
  "web-applications": webApplicationsGraph,
  "data-infrastructure": dataInfrastructureGraph,
  "bots-integrations": botsIntegrationsGraph,
} as const satisfies Readonly<Record<string, WorldGraph>>;

export type WorldId = keyof typeof worldGraphs;
export type CaseWorldId = Exclude<WorldId, "city">;

/**
 * What a scene slot shows: a world and one of its camera views. In the city the views are typed;
 * a case world's views come from its graph ("system" always exists).
 */
export type SceneRef =
  | { readonly world: "city"; readonly view: SceneViewId }
  | { readonly world: CaseWorldId; readonly view: string };

export function isWorldId(id: string): id is WorldId {
  return Object.hasOwn(worldGraphs, id);
}

function isSceneViewId(id: string): id is SceneViewId {
  return sceneViewIds.some((view) => view === id);
}

/** A scene reference from untyped data (content), or null when the world or the view is unknown. */
export function toSceneRef(world: string, view: string): SceneRef | null {
  if (!isWorldId(world)) return null;
  if (world === "city") return isSceneViewId(view) ? { world, view } : null;
  const graph: WorldGraph = worldGraphs[world];
  return Object.hasOwn(graph.views, view) ? { world, view } : null;
}

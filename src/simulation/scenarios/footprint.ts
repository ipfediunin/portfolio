import type { SystemGraph } from "../model/graph";
import { SimulationSession } from "../runtime/session";
import { scenarioIds, scenarios, type ScenarioId } from "./catalog";

/**
 * Nodes each scenario's default run touches (packets and status cards), found by running it once.
 * Deriving it from the simulation keeps "scenarios through this node" true to what the playground
 * will actually show, including side effects like the DLQ alert on monitoring.
 */
export function scenarioFootprints(
  graph: SystemGraph,
): ReadonlyMap<ScenarioId, ReadonlySet<string>> {
  const links = new Map(graph.links.map((link) => [link.id, link]));
  const footprints = new Map<ScenarioId, ReadonlySet<string>>();
  for (const scenarioId of scenarioIds) {
    const spec = scenarios[scenarioId];
    const sample = spec.request.sampleBody;
    // A fresh session per scenario: a cold cache and a full rate limiter, like a first visit.
    const runs = new SimulationSession(graph).submit(
      {
        scenarioId,
        body: sample ? JSON.stringify(sample) : null,
        options: spec.defaults,
      },
      { playbackTime: 0, wallTime: 0 },
    );
    const nodes = new Set<string>();
    for (const event of runs.flatMap((run) => run.events)) {
      if (event.type === "node.status") nodes.add(event.nodeId);
      if (event.type !== "packet.hop") continue;
      const link = links.get(event.hop.linkId);
      if (!link) continue;
      nodes.add(link.from);
      nodes.add(link.to);
    }
    footprints.set(scenarioId, nodes);
  }
  return footprints;
}

/** Scenarios whose default run passes through `nodeId`, in catalog order. */
export function scenariosThroughNode(
  footprints: ReadonlyMap<ScenarioId, ReadonlySet<string>>,
  nodeId: string,
): ScenarioId[] {
  return scenarioIds.filter((scenarioId) =>
    footprints.get(scenarioId)?.has(nodeId),
  );
}

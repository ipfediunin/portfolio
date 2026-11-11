import { findNodeProfile } from "@/content/nodes";
import { visibleProjects } from "@/content/projects";
import { findTechnology } from "@/content/stack";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localizePath } from "@/i18n/paths";
import { cityGraph } from "@/simulation/graphs/city";
import {
  scenarioFootprints,
  scenariosThroughNode,
} from "@/simulation/scenarios/footprint";
import type { ScenarioId } from "@/simulation/scenarios/catalog";

/** Everything the inspector shows about a node, already localized (plain data for a client component). */
export interface InspectorNode {
  readonly id: string;
  readonly label: string;
  readonly tech: string;
  /** Localized kind, e.g. "Сервис". */
  readonly kind: string;
  readonly role: string;
  readonly practices: readonly string[];
  readonly technologies: readonly {
    readonly name: string;
    readonly href: string;
  }[];
  readonly scenarios: readonly {
    readonly id: ScenarioId;
    readonly title: string;
  }[];
  /** Case studies that used one of this component's technologies. */
  readonly cases: readonly {
    readonly title: string;
    readonly href: string;
  }[];
}

export type InspectorCopy = Dictionary["inspector"];

/** Computed once per server process: the simulation is deterministic. */
const footprints = scenarioFootprints(cityGraph);

/** Inspector content for every node of the city, in graph order. */
export function inspectorNodes(
  locale: Locale,
  dictionary: Dictionary,
): InspectorNode[] {
  return cityGraph.nodes.map((node) => {
    const profile = findNodeProfile(node.id);
    if (!profile)
      throw new Error(`Node "${node.id}" has no profile in content/nodes.ts`);
    return {
      id: node.id,
      label: node.label,
      tech: node.tech,
      kind: dictionary.inspector.kinds[node.kind],
      role: profile.role[locale],
      practices: profile.practices.map((practice) => practice[locale]),
      technologies: profile.technologies.flatMap((technologyId) => {
        const entry = findTechnology(technologyId);
        return entry
          ? [
              {
                name: entry.technology.name,
                href: localizePath(locale, `/expertise/${entry.area.id}`),
              },
            ]
          : [];
      }),
      scenarios: scenariosThroughNode(footprints, node.id).map((id) => ({
        id,
        title: dictionary.playground.scenarios[id].title,
      })),
      cases: visibleProjects()
        .filter((project) =>
          project.technologies.some((id) => profile.technologies.includes(id)),
        )
        .map((project) => ({
          title: project.title,
          href: localizePath(locale, `/projects/${project.slug}`),
        })),
    };
  });
}

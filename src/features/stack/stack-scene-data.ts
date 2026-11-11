import { nodeProfiles } from "@/content/nodes";
import { caseNumber, visibleProjects } from "@/content/projects";
import type { StackArea } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/paths";
import { cityGraph } from "@/simulation/graphs/city";

/** A technology of a stack area with the buildings of that district it runs in. */
export interface StackTechnology {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly nodeIds: readonly string[];
  /** Labels of those buildings, as on the scene ("Orders API"). */
  readonly nodeLabels: readonly string[];
  /** Case studies that used the technology ("01 · Intelligent Knowledge Base"). */
  readonly cases: readonly { readonly title: string; readonly href: string }[];
  /** The section of the site that shows it when no building or case does. */
  readonly shownAt: { readonly title: string; readonly href: string } | null;
}

const nodesById = new Map(cityGraph.nodes.map((node) => [node.id, node]));

/**
 * Technologies of a stack area linked to buildings and to case studies. Only the district's own
 * buildings are used, so pointing at a technology lights up something in frame; a technology used
 * nowhere in the district falls back to every building that uses it. Technologies with no building
 * in the city (AI, data, networking) are shown through the cases that used them.
 */
export function stackTechnologies(
  area: StackArea,
  locale: Locale,
): StackTechnology[] {
  const district = new Set(cityGraph.views[area.id].nodes ?? []);
  return area.technologies.map((technology) => {
    const users = nodeProfiles
      .filter((profile) => profile.technologies.includes(technology.id))
      .flatMap((profile) => profile.nodes);
    const inDistrict = users.filter((nodeId) => district.has(nodeId));
    const nodeIds = inDistrict.length > 0 ? inDistrict : users;
    return {
      id: technology.id,
      name: technology.name,
      summary: technology.summary[locale],
      nodeIds,
      nodeLabels: [
        ...new Set(nodeIds.map((nodeId) => nodesById.get(nodeId)?.label)),
      ].filter((label): label is string => label !== undefined),
      cases: visibleProjects()
        .filter((project) => project.technologies.includes(technology.id))
        .map((project) => ({
          title: `${caseNumber(project)} · ${project.title}`,
          href: localizePath(locale, `/projects/${project.slug}`),
        })),
      shownAt: technology.shownAt
        ? {
            title: technology.shownAt.label[locale],
            href: localizePath(locale, technology.shownAt.path),
          }
        : null,
    };
  });
}

import {
  toSceneRef,
  worldGraphs,
  type SceneRef,
} from "@/simulation/graphs/worlds";
import type { WorldGraph } from "@/simulation/model/graph";
import { scenarioIds } from "@/simulation/scenarios/catalog";

import {
  botsIntegrationsGlance,
  botsIntegrationsProject,
} from "./cases/bots-integrations";
import {
  corporateMessengerGlance,
  corporateMessengerProject,
} from "./cases/corporate-messenger";
import {
  dataInfrastructureGlance,
  dataInfrastructureProject,
} from "./cases/data-infrastructure";
import { eventDrivenGlance, eventDrivenProject } from "./cases/event-driven";
import {
  knowledgeBaseGlance,
  knowledgeBaseProject,
} from "./cases/knowledge-base";
import {
  processAutomationGlance,
  processAutomationProject,
} from "./cases/process-automation";
import {
  scientificDataGlance,
  scientificDataProject,
} from "./cases/scientific-data";
import {
  webApplicationsGlance,
  webApplicationsProject,
} from "./cases/web-applications";
import { projectsSchema, type Project, type WorldOutline } from "./schema";
import { stackAreas } from "./stack";

/** A case study with its scene resolved to a world the engine knows. */
export type CaseStudy = Omit<Project, "scene"> & { readonly scene: SceneRef };

const worlds = new Map<string, WorldOutline>(
  Object.entries(worldGraphs).map(([id, graph]: [string, WorldGraph]) => [
    id,
    { views: new Set(Object.keys(graph.views)) },
  ]),
);

/**
 * Case studies, in list order. Each one is `cases/<slug>.ts` (data, the demo copy and the glance:
 * before and after, the charts its model computes, what I did) plus `cases/<slug>.en.mdx` (the full
 * story: problem, my part, architecture, implementation, result; `.ru.mdx` is a dormant archive).
 */
export const projects: readonly CaseStudy[] = projectsSchema({
  technologyIds: new Set(
    stackAreas.flatMap((area) => area.technologies.map((tech) => tech.id)),
  ),
  scenarioIds: new Set(scenarioIds),
  worlds,
})
  .parse([
    { ...knowledgeBaseProject, glance: knowledgeBaseGlance },
    { ...scientificDataProject, glance: scientificDataGlance },
    { ...processAutomationProject, glance: processAutomationGlance },
    { ...corporateMessengerProject, glance: corporateMessengerGlance },
    { ...eventDrivenProject, glance: eventDrivenGlance },
    { ...webApplicationsProject, glance: webApplicationsGlance },
    { ...dataInfrastructureProject, glance: dataInfrastructureGlance },
    { ...botsIntegrationsProject, glance: botsIntegrationsGlance },
  ])
  .sort((a, b) => a.order - b.order)
  .map((project) => {
    const scene = toSceneRef(project.scene.world, project.scene.view);
    // The schema has checked the world and the view; this only narrows the type.
    if (!scene) throw new Error(`Project "${project.slug}" has no scene`);
    return { ...project, scene };
  });

/**
 * A still frame of the case world for its card (`npm run posters:cases` captures it from the real
 * scene). A test checks that every case has one.
 */
export const casePosterPath = (slug: string) => `/cases/${slug}.jpg`;

/** Drafts are visible while developing, so a case can be read on the real page before it ships. */
export function isProjectVisible(project: CaseStudy): boolean {
  return project.published || process.env.NODE_ENV !== "production";
}

export const visibleProjects = (): readonly CaseStudy[] =>
  projects.filter(isProjectVisible);

export function findProject(slug: string): CaseStudy | undefined {
  return visibleProjects().find((project) => project.slug === slug);
}

/** "01", "02"…: the number shown as "Case 01". */
export const caseNumber = (project: CaseStudy) =>
  String(project.order).padStart(2, "0");

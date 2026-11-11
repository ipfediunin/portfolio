import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { locales } from "@/i18n/config";

import { cityGraph } from "@/simulation/graphs/city";

import { nodeProfiles } from "./nodes";
import { casePosterPath, projects, visibleProjects } from "./projects";
import {
  nodeProfilesSchema,
  projectsSchema,
  stackAreasSchema,
  stackAreaIds,
} from "./schema";
import { siteConfig } from "./site";
import { findStackArea, stackAreas } from "./stack";

describe("stack content", () => {
  it("defines every area exactly once, in the declared order", () => {
    expect(stackAreas.map((area) => area.id)).toEqual([...stackAreaIds]);
  });

  it("finds areas by id and rejects unknown ids", () => {
    expect(findStackArea("backend")?.title.en).toBe("Backend");
    expect(findStackArea("design")).toBeUndefined();
  });

  it("rejects duplicate technology ids across areas", () => {
    const [backend, frontend, automation] = stackAreas;
    if (!backend || !frontend || !automation)
      throw new Error("Expected three stack areas");

    const duplicate = {
      ...frontend,
      technologies: [...frontend.technologies, backend.technologies[0]],
    };
    expect(
      stackAreasSchema.safeParse([backend, duplicate, automation]).success,
    ).toBe(false);
  });
});

describe("site config", () => {
  it("shows only what the deployment configured, never a placeholder", () => {
    const shown = [
      siteConfig.email,
      siteConfig.resumeUrl,
      siteConfig.schedulingUrl,
      ...siteConfig.profiles.map((profile) => profile.href),
    ].filter((value): value is string => value !== null);
    for (const value of shown) expect(value).not.toMatch(/example\.(com|org)/);
    // Without NEXT_PUBLIC_SITE_INDEXABLE=true a build stays out of search indexes.
    expect(siteConfig.indexable).toBe(false);
  });
});

describe("node profiles", () => {
  it("describe every node of the city exactly once", () => {
    const described = nodeProfiles.flatMap((profile) => profile.nodes);
    expect([...described].sort()).toEqual(
      cityGraph.nodes.map((node) => node.id).sort(),
    );
  });

  it("give every stack technology a building, a published case or a section", () => {
    const shown = new Set([
      ...nodeProfiles.flatMap((profile) => profile.technologies),
      ...projects
        .filter((project) => project.published)
        .flatMap((project) => project.technologies),
      ...stackAreas
        .flatMap((area) => area.technologies)
        .filter((technology) => technology.shownAt)
        .map((technology) => technology.id),
    ]);
    for (const technology of stackAreas.flatMap((area) => area.technologies))
      expect(shown.has(technology.id), technology.id).toBe(true);
  });

  it("reject unknown technologies", () => {
    const [first] = nodeProfiles;
    if (!first) throw new Error("Expected node profiles");
    const broken = { ...first, technologies: ["cobol"] };
    expect(
      nodeProfilesSchema(new Set(["fastapi"])).safeParse([broken]).success,
    ).toBe(false);
  });
});

describe("projects", () => {
  it("have a still frame of their world for the card", () => {
    for (const project of projects)
      expect(
        existsSync(
          join(__dirname, "..", "..", "public", casePosterPath(project.slug)),
        ),
        `${casePosterPath(project.slug)}: run npm run posters:cases`,
      ).toBe(true);
  });

  it("have their story in every language", () => {
    for (const project of projects)
      for (const locale of locales)
        expect(
          existsSync(join(__dirname, "cases", `${project.slug}.${locale}.mdx`)),
          `${project.slug}.${locale}.mdx`,
        ).toBe(true);
  });

  it("reject unknown technologies, scenarios, worlds and views", () => {
    const first = projects[0];
    if (!first) throw new Error("Expected a project");
    const input = { ...first, scene: { ...first.scene } };
    const schema = projectsSchema({
      technologyIds: new Set(first.technologies),
      scenarioIds: new Set(first.scenarios),
      worlds: new Map([
        [first.scene.world, { views: new Set([first.scene.view]) }],
      ]),
    });
    expect(schema.safeParse([input]).success).toBe(true);
    for (const broken of [
      { ...input, technologies: ["cobol"] },
      { ...input, scenarios: ["teleport"] },
      { ...input, scene: { world: "atlantis", view: "system" } },
      { ...input, scene: { ...input.scene, view: "orbit" } },
    ])
      expect(schema.safeParse([broken]).success).toBe(false);
    expect(
      schema.safeParse([input, { ...input, slug: "copy" }]).success,
      "case numbers are unique",
    ).toBe(false);
  });

  it("keep drafts out of production", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(visibleProjects().every((project) => project.published)).toBe(
        true,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

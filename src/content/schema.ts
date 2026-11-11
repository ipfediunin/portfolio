import { z } from "zod";

import {
  compareImpact,
  impactUnits,
  improves,
} from "@/simulation/cases/impact";

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a kebab-case slug");

export const localizedSchema = z.object({
  ru: z.string().trim().min(1),
  en: z.string().trim().min(1),
});

export const stackAreaIds = ["backend", "frontend", "automation"] as const;
export const stackAreaIdSchema = z.enum(stackAreaIds);
export type StackAreaId = z.infer<typeof stackAreaIdSchema>;

export const technologySchema = z.object({
  id: slugSchema,
  name: z.string().trim().min(1),
  summary: localizedSchema,
  /** Where the site shows it when no building runs it and no case lists it (a path with a section). */
  shownAt: z
    .object({
      path: z.string().regex(/^\/[\w/-]*(#[\w-]+)?$/, "Expected /page#section"),
      label: localizedSchema,
    })
    .optional(),
});

export const codeSnippetSchema = z.object({
  /** Shown as the file name above the code. */
  file: z.string().trim().min(1),
  code: z.string().min(1),
  caption: localizedSchema,
});

export const stackAreaSchema = z.object({
  id: stackAreaIdSchema,
  title: localizedSchema,
  tagline: localizedSchema,
  lead: localizedSchema,
  /** A short, real-looking piece of code for the area's page. */
  snippet: codeSnippetSchema,
  technologies: z.array(technologySchema).min(1),
});

export const stackAreasSchema = z
  .array(stackAreaSchema)
  .length(stackAreaIds.length)
  .superRefine((areas, context) => {
    const areaIds = new Set(areas.map((area) => area.id));
    if (areaIds.size !== areas.length) {
      context.addIssue({
        code: "custom",
        message: "Stack area ids must be unique",
      });
    }

    const technologyIds = new Set<string>();
    for (const technology of areas.flatMap((area) => area.technologies)) {
      if (technologyIds.has(technology.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate technology id "${technology.id}"`,
        });
      }
      technologyIds.add(technology.id);
    }
  });

export type StackArea = z.infer<typeof stackAreaSchema>;

/** Inspector content for one or more scene nodes (identical workers share a profile). */
export const nodeProfileSchema = z.object({
  /** Graph node ids (src/simulation/graphs/city.ts). */
  nodes: z.array(z.string().min(1)).min(1),
  /** What the component is and why the system needs it. */
  role: localizedSchema,
  /** How it is built and run: the engineering decisions behind it. */
  practices: z.array(localizedSchema).min(2).max(4),
  /** Technology ids from the stack content. */
  technologies: z.array(slugSchema).min(1),
});

export type NodeProfile = z.infer<typeof nodeProfileSchema>;

/** Profiles must not overlap and may reference only known technologies. */
export function nodeProfilesSchema(technologyIds: ReadonlySet<string>) {
  return z.array(nodeProfileSchema).superRefine((profiles, context) => {
    const seen = new Set<string>();
    for (const profile of profiles) {
      for (const nodeId of profile.nodes) {
        if (seen.has(nodeId))
          context.addIssue({
            code: "custom",
            message: `Node "${nodeId}" has more than one profile`,
          });
        seen.add(nodeId);
      }
      for (const technologyId of profile.technologies) {
        if (!technologyIds.has(technologyId))
          context.addIssue({
            code: "custom",
            message: `Unknown technology "${technologyId}"`,
          });
      }
    }
  });
}

const impactMeasureSchema = z.object({
  id: z.string().min(1),
  unit: z.enum(impactUnits),
  better: z.enum(["lower", "higher"]),
  bars: z
    .array(
      z.object({
        id: z.string().min(1),
        value: z.number().finite().nonnegative(),
      }),
    )
    .min(2)
    .max(4)
    .readonly(),
});

/**
 * The big number of a chart: how many times better the result is, how much less of something
 * there is (lower-is-better only), or the result itself.
 */
export const glanceFigures = ["ratio", "reduction", "after"] as const;
export type GlanceFigure = (typeof glanceFigures)[number];

const glanceChartSchema = z
  .object({
    /** Computed by the case's model (src/simulation/cases/<slug>/impact.ts), never typed in. */
    measure: impactMeasureSchema,
    /** What is measured: "Answer time". */
    title: z.string().trim().min(1).max(48),
    figure: z.enum(glanceFigures),
    /** Read after the big number: "faster when a question is asked again". */
    caption: z.string().trim().min(1).max(80),
    /** A label for every bar of the measure, by bar id. */
    bars: z.record(z.string(), z.string().trim().min(1).max(48)),
    /** How the model measured it, in one sentence. */
    method: z.string().trim().min(1).max(160),
  })
  .superRefine((chart, context) => {
    const issue = (message: string) =>
      context.addIssue({
        code: "custom",
        message: `Chart "${chart.measure.id}": ${message}`,
      });
    const barIds = new Set(chart.measure.bars.map((bar) => bar.id));
    for (const id of barIds) if (!chart.bars[id]) issue(`no label for "${id}"`);
    for (const id of Object.keys(chart.bars))
      if (!barIds.has(id)) issue(`label for unknown bar "${id}"`);
    if (!improves(chart.measure))
      issue("the last bar is not an improvement on the first");
    const comparison = compareImpact(chart.measure);
    if (chart.figure === "ratio" && comparison.ratio === null)
      issue("a ratio needs non-zero bars");
    if (chart.figure === "reduction" && comparison.reduction === null)
      issue("a reduction needs a lower-is-better measure");
  });

/**
 * The case in a minute, above the demo and the full story: before and after in a few words, what
 * the approach changes in numbers (from the case's model) and what I did. English only.
 */
export const caseGlanceSchema = z.object({
  before: z.array(z.string().trim().min(1).max(80)).min(2).max(3),
  after: z.array(z.string().trim().min(1).max(80)).min(2).max(3),
  did: z.array(z.string().trim().min(1).max(48)).min(3).max(5),
  charts: z.array(glanceChartSchema).min(1).max(2),
});

export type CaseGlanceInput = z.input<typeof caseGlanceSchema>;
export type CaseGlance = z.infer<typeof caseGlanceSchema>;
export type GlanceChart = CaseGlance["charts"][number];

const contactLinkSchema = z.object({
  id: slugSchema,
  label: z.string().trim().min(1),
  href: z.url({ protocol: /^https?$/ }),
});

export const projectSchema = z.object({
  slug: slugSchema,
  /** Drafts render in development only: never in a production build, the list or the sitemap. */
  published: z.boolean(),
  /** Position in the list and the case number ("Case 01"). */
  order: z.number().int().positive(),
  /** International name, the same in both languages, e.g. "Intelligent Knowledge Base". */
  title: z.string().trim().min(1),
  /** What the system is, in the page's language. */
  subtitle: localizedSchema,
  /** Engineering area, e.g. "AI Engineering / Backend / Vector Search". */
  direction: z.string().trim().min(1),
  /** One or two sentences for cards and metadata. */
  summary: localizedSchema,
  /**
   * What the story is based on: one specific system I built ("project"), or my work across several
   * systems of one kind summed up ("practice"). The demo is always a reconstruction on synthetic data.
   */
  basis: z.enum(["project", "practice"]),
  /** A caveat under the header, e.g. that the case sums up work across several systems. */
  note: localizedSchema.optional(),
  /** The case's own world on the scene (src/simulation/graphs/worlds.ts) and its camera view. */
  scene: z.object({
    world: z.string().min(1),
    view: z.string().min(1).default("system"),
  }),
  /** Only what the project really used, named the way the industry names it. */
  stack: z.array(z.string().trim().min(1)).min(1),
  /** Stack technology ids (src/content/stack.ts) that link to the stack pages. */
  technologies: z.array(slugSchema).default([]),
  /** Playground scenarios that show the same engineering idea. */
  scenarios: z.array(z.string()).default([]),
  /** The result in numbers: measured values only, never estimates. */
  metrics: z
    .array(
      z.object({ value: z.string().trim().min(1), label: localizedSchema }),
    )
    .max(4)
    .default([]),
  links: z.array(contactLinkSchema).default([]),
  /** The case at a glance (written next to the demo copy, after the model it measures). */
  glance: caseGlanceSchema,
});

export type ProjectInput = z.input<typeof projectSchema>;
/** A case's registry entry; its glance joins it in projects.ts. */
export type CaseRecordInput = Omit<ProjectInput, "glance">;
export type Project = z.infer<typeof projectSchema>;

/** What a project's world offers: its camera views. */
export interface WorldOutline {
  readonly views: ReadonlySet<string>;
}

/** Slugs and case numbers are unique; technologies, scenarios, the world and its view must exist. */
export function projectsSchema(known: {
  readonly technologyIds: ReadonlySet<string>;
  readonly scenarioIds: ReadonlySet<string>;
  readonly worlds: ReadonlyMap<string, WorldOutline>;
}) {
  return z.array(projectSchema).superRefine((projects, context) => {
    const issue = (message: string) =>
      context.addIssue({ code: "custom", message });
    const slugs = new Set<string>();
    const orders = new Set<number>();
    for (const project of projects) {
      const name = `Project "${project.slug}"`;
      if (slugs.has(project.slug)) issue(`Duplicate project "${project.slug}"`);
      slugs.add(project.slug);
      if (orders.has(project.order))
        issue(`${name} repeats case number ${project.order}`);
      orders.add(project.order);
      for (const id of project.technologies)
        if (!known.technologyIds.has(id))
          issue(`${name} uses unknown technology "${id}"`);
      for (const id of project.scenarios)
        if (!known.scenarioIds.has(id))
          issue(`${name} links unknown scenario "${id}"`);

      const world = known.worlds.get(project.scene.world);
      if (!world) {
        issue(`${name} shows unknown world "${project.scene.world}"`);
        continue;
      }
      if (!world.views.has(project.scene.view))
        issue(`${name} uses unknown view "${project.scene.view}"`);
    }
  });
}

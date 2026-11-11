import { z } from "zod";

import { projects } from "./projects";

/**
 * The page for recruiters and hiring managers (/for-employers). Claims stay within the profile the
 * owner confirmed (`about.profile` in the dictionary): no years of experience, employers, degrees,
 * certificates or levels. The technical stack itself is rendered from `about.profile`, so it has
 * one source.
 */

const employerPageSchema = z.object({
  // Used as the full <title> (no site-name suffix), so it has to fit a search result on its own.
  metaTitle: z.string().min(10).max(60),
  metaDescription: z.string().min(70).max(160),
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  lead: z.string().min(1),
  roles: z.object({
    title: z.string().min(1),
    items: z.array(z.string().min(1)).min(1),
    note: z.string().min(1),
  }),
  expertise: z.object({
    title: z.string().min(1),
    items: z
      .array(z.object({ title: z.string().min(1), text: z.string().min(1) }))
      .min(3),
  }),
  cases: z.object({
    title: z.string().min(1),
    lead: z.string().min(1),
    slugs: z.array(z.string()).min(2),
    all: z.string().min(1),
  }),
  stackTitle: z.string().min(1),
  approachTitle: z.string().min(1),
  links: z.object({
    title: z.string().min(1),
    resume: z.string().min(1),
  }),
  contact: z.object({
    title: z.string().min(1),
    lead: z.string().min(1),
    cta: z.string().min(1),
  }),
});

const caseSlugs = new Set(projects.map((project) => project.slug));

export const employerPage = employerPageSchema
  .superRefine((page, context) => {
    for (const slug of page.cases.slugs)
      if (!caseSlugs.has(slug))
        context.addIssue({
          code: "custom",
          message: `The employer page links unknown case "${slug}"`,
        });
  })
  .parse({
    metaTitle: "Engineering Profile — Python Backend & AI Engineer",
    metaDescription:
      "Engineering profile of a full-stack and AI engineer: Python backends (FastAPI, Django, Flask), RAG and LLM systems, messaging, automation and React/Next.js.",
    eyebrow: "For employers",
    title: "Engineering profile",
    lead: "Full-stack developer with a Python backend focus, building AI systems and automation. This page collects what a hiring team usually asks for: the areas I work in, selected projects, the stack and how to reach me.",
    roles: {
      title: "Roles I'm a fit for",
      items: [
        "Python Backend Engineer",
        "Full-Stack Engineer (Python + React / Next.js)",
        "AI / LLM Application Engineer",
      ],
      note: "Open to remote roles, on a contractor basis through my individual entrepreneurship.",
    },
    expertise: {
      title: "Core expertise",
      items: [
        {
          title: "Python backend",
          text: "APIs and services with FastAPI, Django and Flask; asynchronous programming; integrations between systems; PostgreSQL and Redis.",
        },
        {
          title: "AI systems",
          text: "RAG pipelines: document chunking, embeddings, vector search with pgvector or Milvus, relevance thresholds and answers with sources.",
        },
        {
          title: "Messaging and distributed systems",
          text: "RabbitMQ and Apache Kafka, background processing, event-driven architecture, retries and failure handling.",
        },
        {
          title: "Frontend",
          text: "React and Next.js with TypeScript: multi-page websites, interfaces for backends, client applications and admin panels.",
        },
        {
          title: "Automation and data",
          text: "Python automation, bots and API integrations; numerical processing with NumPy, SciPy and Pandas.",
        },
      ],
    },
    cases: {
      title: "Selected technical projects",
      lead: "Each case explains the problem, the architecture and my role, with an interactive model of how the system behaves.",
      slugs: [
        "knowledge-base",
        "event-driven",
        "data-infrastructure",
        "web-applications",
      ],
      all: "All case studies",
    },
    stackTitle: "Technical stack",
    approachTitle: "Engineering approach",
    links: {
      title: "Professional links",
      resume: "Download résumé",
    },
    contact: {
      title: "Hiring for a role?",
      lead: "Send the role description or a link to it. I'll reply with whether it fits and any questions.",
      cta: "Get in touch about a role",
    },
  });

/** Topics a Person schema lists as knowsAbout: the headline areas, not every tool. */
export const knowsAbout = [
  "Python",
  "FastAPI",
  "Django",
  "Flask",
  "Retrieval-augmented generation",
  "Large language models",
  "Vector search",
  "RabbitMQ",
  "Apache Kafka",
  "React",
  "Next.js",
  "Business process automation",
] as const;

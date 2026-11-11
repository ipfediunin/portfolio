import { z } from "zod";

import { projects } from "./projects";

/**
 * What a client can hire me for. Six directions appear on /hire; the four with a search intent of
 * their own and enough related work also get a landing page under /services/[slug]. The site is
 * English-only, so this content is written in English only. Nothing here promises timelines,
 * prices, guarantees or support terms.
 */

const sectionSchema = z.object({
  title: z.string().min(1),
  paragraph: z.string().min(1).optional(),
  items: z.array(z.string().min(1)).default([]),
});

const landingSchema = z.object({
  // Used as the full <title> (no site-name suffix), so it has to fit a search result on its own.
  metaTitle: z.string().min(10).max(60),
  metaDescription: z.string().min(70).max(160),
  title: z.string().min(1),
  lead: z.string().min(1),
  sections: z.array(sectionSchema).min(2),
  faq: z
    .array(z.object({ question: z.string().min(1), answer: z.string().min(1) }))
    .min(2),
});

const serviceSchema = z.object({
  slug: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  /** The client's problem, in their terms. */
  problem: z.string().min(1),
  /** What they get: the product or the functional result. */
  outcome: z.string().min(1),
  technologies: z.array(z.string().min(1)).min(1),
  /** Case studies that show this kind of work (project slugs). */
  cases: z.array(z.string()).min(1),
  landing: landingSchema.nullable(),
});

export type Service = z.infer<typeof serviceSchema>;
export type ServiceLanding = NonNullable<Service["landing"]>;

const caseSlugs = new Set(projects.map((project) => project.slug));

export const services: readonly Service[] = z
  .array(serviceSchema)
  .superRefine((items, context) => {
    for (const service of items)
      for (const slug of service.cases)
        if (!caseSlugs.has(slug))
          context.addIssue({
            code: "custom",
            message: `Service "${service.slug}" links unknown case "${slug}"`,
          });
  })
  .parse([
    {
      slug: "python-backend",
      title: "Python Backend Development",
      summary:
        "APIs, server-side logic and integrations in Python — with FastAPI, Django or Flask, chosen for the job.",
      problem:
        "Your product needs a backend that handles requests reliably, keeps data consistent and connects to the services around it.",
      outcome:
        "An API and server-side logic: request validation, business rules, database access and integrations, with long-running work moved off the request path.",
      technologies: [
        "Python",
        "FastAPI",
        "Django",
        "Flask",
        "PostgreSQL",
        "Redis",
        "REST API",
      ],
      cases: ["web-applications", "event-driven", "process-automation"],
      landing: {
        metaTitle: "Python Backend Development — FastAPI, Django, Flask",
        metaDescription:
          "Python backend development: REST APIs, server-side logic, databases and integrations with FastAPI, Django or Flask, with slow work moved to background jobs.",
        title: "Python Backend Development",
        lead: "APIs and server-side logic in Python, built around your data and the systems you already use.",
        sections: [
          {
            title: "What this covers",
            items: [
              "REST APIs for web and mobile clients, internal tools and other services.",
              "Business logic and validation that keep data consistent.",
              "Database design and access with PostgreSQL.",
              "Integrations with external APIs and webhooks.",
              "Background processing for work that should not block a request.",
            ],
          },
          {
            title: "How I approach it",
            items: [
              "Framework by fit: FastAPI for typed, asynchronous API services; Django when an application benefits from its ORM, migrations and admin; Flask for small services and integration layers.",
              "Contracts first: request and response schemas are defined up front, so invalid input is rejected with a clear, per-field error.",
              "Slow work leaves the request: tasks go to a queue and the API answers at once.",
              "Failure handling is designed in: timeouts, clear error responses and logs that explain what happened.",
            ],
          },
          {
            title: "What you get",
            paragraph:
              "A working backend with an API description your team can build against, the code in your repository, and an explanation of how the parts fit together.",
          },
        ],
        faq: [
          {
            question: "FastAPI, Django or Flask — which one?",
            answer:
              "It depends on the project. FastAPI suits typed, asynchronous API services; Django suits applications that benefit from its ORM, migrations and admin; Flask suits small services and integration layers. The choice comes from your requirements.",
          },
          {
            question: "Can you work on an existing codebase?",
            answer:
              "Yes. The first step is reading the current code and architecture, so changes fit what is already there.",
          },
          {
            question: "What do you need to start a conversation?",
            answer:
              "A short description of the problem, the systems involved and any constraints you know about. The first conversation is for clarifying the scope.",
          },
        ],
      },
    },
    {
      slug: "ai-rag",
      title: "AI & RAG Solutions",
      summary:
        "Question answering over your own documents, LLM features and vector search — built to cite sources and to say when the sources have no answer.",
      problem:
        "Knowledge sits in documents nobody can search well, or you want an LLM feature that answers from your data rather than from general knowledge.",
      outcome:
        "A retrieval pipeline and an API around it: document processing and chunking, embeddings and vector search, and an LLM step that answers from the retrieved context with sources.",
      technologies: [
        "Python",
        "FastAPI",
        "pgvector",
        "Milvus",
        "Redis",
        "LLM APIs",
      ],
      cases: ["knowledge-base", "bots-integrations", "data-infrastructure"],
      landing: {
        metaTitle: "RAG & LLM Development — Python, pgvector, Milvus",
        metaDescription:
          "RAG and LLM development: question answering over your own documents, with chunking, vector search in pgvector or Milvus, relevance thresholds and cited answers.",
        title: "RAG & LLM Application Development",
        lead: "Question answering and search over your own documents, built so that answers come from your sources — and the system says so when the sources have no answer.",
        sections: [
          {
            title: "What this covers",
            items: [
              "Question answering over internal documents and knowledge bases.",
              "Semantic search across documents and records.",
              "LLM features inside existing products and bots.",
              "Pipelines that process and index documents with their metadata.",
            ],
          },
          {
            title: "How a RAG system is built",
            items: [
              "Documents are cleaned and split into fragments sized for meaning, with overlap so an idea is not cut in half.",
              "Fragments and questions become vectors in the same space; search finds the closest by similarity.",
              "A relevance threshold decides what enters the context — low similarity is a sign that the answer is not in the sources.",
              "The model answers from the retrieved fragments and cites them, so every answer can be checked.",
              "Repeated questions can be served from a cache instead of running search and generation again.",
            ],
          },
          {
            title: "pgvector or Milvus",
            paragraph:
              "pgvector keeps vectors next to relational data in PostgreSQL, so vector search combines with ordinary SQL filters and transactions. Milvus is a dedicated vector database with indexes for approximate search over large collections. The right choice depends on where your data lives and how large the collection is.",
          },
        ],
        faq: [
          {
            question: "Will the system make things up?",
            answer:
              "Retrieval reduces that risk: answers come from retrieved sources, cite them, and the system declines when nothing relevant is found. No language model is free of errors, which is why every answer stays checkable against its sources.",
          },
          {
            question: "Can it answer from our own documents only?",
            answer:
              "Yes — that is the point of retrieval. The context comes from the documents you index, not from the model's general knowledge.",
          },
          {
            question: "Which LLM provider would it use?",
            answer:
              "The retrieval pipeline does not depend on one provider. The choice follows your requirements for answer quality, cost and how your data may be handled.",
          },
        ],
      },
    },
    {
      slug: "full-stack",
      title: "Full-Stack Web Applications",
      summary:
        "Web applications with a React / Next.js interface and a Python backend, designed and built as one product.",
      problem:
        "You need a working product, not a standalone API and a set of pages that do not quite fit together.",
      outcome:
        "An application where interface, server logic and data work as one: forms validated on both sides, server-side rules, transactions and responsive pages.",
      technologies: [
        "React",
        "Next.js",
        "TypeScript",
        "Python",
        "Django",
        "FastAPI",
        "Flask",
        "PostgreSQL",
      ],
      cases: ["web-applications"],
      landing: {
        metaTitle: "Full-Stack Web Development — React, Next.js, Python",
        metaDescription:
          "Full-stack web development: React and Next.js interfaces on a Python backend, with forms and validation, business rules, transactions and responsive pages.",
        title: "Full-Stack Web Application Development",
        lead: "Web applications where the interface, the server-side logic and the data are designed together — React and Next.js on the front end, Python on the back end.",
        sections: [
          {
            title: "What this covers",
            items: [
              "Multi-page websites and web applications.",
              "Interfaces for working with a backend: forms, lists, details and actions.",
              "Client applications and admin panels.",
              "The backend and the database behind them.",
            ],
          },
          {
            title: "How it is built",
            items: [
              "Validation on both sides: the browser checks input instantly; the server checks it again, because a request can bypass the form.",
              "The server is the source of truth: conflicts such as a slot that was just taken are resolved there and returned as clear answers.",
              "Related data changes run in one transaction.",
              "Pages are rendered on the server for a fast first view and for search engines, then become interactive.",
            ],
          },
        ],
        faq: [
          {
            question: "Do you build only the front end or only the backend?",
            answer:
              "Both are possible. The advantage of building both is that the interface and the API are designed together, so they fit.",
          },
          {
            question: "Which backend framework would you use?",
            answer:
              "Django, FastAPI or Flask, depending on the application. Django suits apps that need its ORM and admin, FastAPI suits API-first services, Flask suits small focused services.",
          },
        ],
      },
    },
    {
      slug: "automation",
      title: "Business Process Automation",
      summary:
        "Python services and bots that take over repetitive work: collecting data, checking it, passing it on and reporting what happened.",
      problem:
        "People move data between systems by hand, mistakes surface late, and nobody can see the state of the process.",
      outcome:
        "An automated flow: intake from APIs and webhooks, validation with clear rejection reasons, queued processing, stored results, notifications and a view of failures.",
      technologies: ["Python", "Django", "RabbitMQ", "REST API", "Bots"],
      cases: ["process-automation", "bots-integrations"],
      landing: {
        metaTitle: "Business Process Automation with Python — APIs & Bots",
        metaDescription:
          "Python automation for business processes: API and webhook intake, validation, queued processing, notifications and bots, with failures visible in monitoring.",
        title: "Business Process Automation with Python",
        lead: "Python services and bots that take repetitive work off people's hands — and make the state of every run visible.",
        sections: [
          {
            title: "What this covers",
            items: [
              "Moving data between systems through their APIs and webhooks.",
              "Checking incoming data and rejecting bad records with a reason.",
              "Processing that runs in the background through a task queue.",
              "Notifications and bots for the people involved.",
              "Interfaces to monitor and manage automated runs.",
            ],
          },
          {
            title: "How it is built",
            items: [
              "A queue separates intake from processing: the source gets an answer at once and the work runs at its own pace.",
              "A failure in one task does not stop the rest — it is logged and visible, not lost.",
              "Calls to external services are separate steps, so an outage on their side does not break data intake.",
              "Bots handle multi-step scenarios as state machines, with the dialog state stored between messages.",
            ],
          },
        ],
        faq: [
          {
            question: "Which processes are good candidates?",
            answer:
              "Repetitive steps with clear rules: collecting data from a source, checking it, passing it to another system and telling someone about the result.",
          },
          {
            question: "What happens when an external service is down?",
            answer:
              "The task records the error, the failure shows up in monitoring, and the rest of the batch continues.",
          },
        ],
      },
    },
    {
      slug: "data-processing",
      title: "Data Processing & Analytics",
      summary:
        "Numerical processing in Python: cleaning data, interpolation and numerical methods, and plots to check the results against.",
      problem:
        "Measurements arrive with gaps and outliers, at a step that does not match what you need, and the results have to be verifiable.",
      outcome:
        "Processing tools that load, clean and transform data, restore the values in between with a suitable method, and produce plots and error metrics.",
      technologies: ["Python", "NumPy", "SciPy", "Pandas", "Matplotlib"],
      cases: ["scientific-data"],
      landing: null,
    },
    {
      slug: "integrations-messaging",
      title: "Backend Integrations & Messaging",
      summary:
        "Message brokers, API integrations and network communication between services and clients.",
      problem:
        "Work has to happen outside a single request, several services need the same events, or clients must exchange messages over the network.",
      outcome:
        "Messaging between components: queues with competing workers, event logs with consumer groups, API integrations and socket-based client-server communication.",
      technologies: [
        "RabbitMQ",
        "Apache Kafka",
        "Redis",
        "Python sockets",
        "TCP / UDP",
      ],
      cases: ["event-driven", "corporate-messenger", "data-infrastructure"],
      landing: null,
    },
  ]);

export const landingServices = services.filter(
  (service): service is Service & { readonly landing: ServiceLanding } =>
    service.landing !== null,
);

export const findLandingService = (slug: string) =>
  landingServices.find((service) => service.slug === slug);

/** Services a case study belongs to, for "Related services" on the case page. */
export const servicesForCase = (slug: string) =>
  services.filter((service) => service.cases.includes(slug));

/** How a project with me runs. No timelines, prices or guarantees: those depend on the project. */
export const workProcess = [
  {
    title: "Discovery",
    text: "We clarify the problem, the people who will use the result, the data and the systems involved.",
  },
  {
    title: "Solution design",
    text: "I propose an architecture and the scope of a first working version, and we agree on it before building.",
  },
  {
    title: "Development",
    text: "The system is built in small steps you can see and comment on.",
  },
  {
    title: "Validation",
    text: "Each part is checked with tests, real runs and a look at the edge cases.",
  },
  {
    title: "Delivery",
    text: "The result goes into your repository and environment, with an explanation of how it works.",
  },
] as const;

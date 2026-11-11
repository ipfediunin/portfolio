/**
 * Copy of the client page (/hire). The services themselves live in `services.ts`. No prices,
 * timelines or guarantees: they depend on the project and are discussed first.
 */
export const hirePage = {
  metaTitle: "Hire a Python Backend & AI Developer — Custom Development",
  metaDescription:
    "Custom Python backend, AI and web development: APIs with FastAPI and Django, RAG and LLM features, automation, data processing and React/Next.js applications.",
  eyebrow: "For clients",
  title: "Custom Python Backend, AI & Web Development",
  lead: "I design and build backends, AI features and automation for products and internal tools — and the web interfaces around them. Every service below links to case studies that show this kind of work.",
  primaryCta: "Discuss your project",
  secondaryCta: "View case studies",
  servicesTitle: "Services",
  problem: "The problem",
  outcome: "What you get",
  relatedCases: "Related case studies",
  more: "More about",
  processTitle: "How I work",
  processLead:
    "Every project goes through the same steps. Scope, timing and cost are agreed after discovery, when the problem is clear. The contract and invoices go through my individual entrepreneurship registered in Armenia.",
  startTitle: "How to start",
  startLead:
    "A first message does not need a specification. It helps to include:",
  startItems: [
    "What the system should do and who will use it.",
    "The systems, data and services it has to work with.",
    "Constraints you already know about: hosting, technologies, deadlines.",
  ],
  contact: {
    title: "Have a system to build?",
    lead: "Describe the problem in a few sentences. I'll reply with questions and a proposed approach.",
    cta: "Discuss your project",
  },
} as const;

/** Labels of a service landing page (/services/[slug]); the content is in `services.ts`. */
export const servicePageCopy = {
  breadcrumbs: "Breadcrumbs",
  technologies: "Technologies",
  cases: "Related case studies",
  casesLead:
    "Case studies with this kind of work — each with an interactive model of the system.",
  faq: "Questions",
  otherServices: "Other services",
  allServices: "All services",
} as const;

import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow, SectionHeading } from "@/components/ui/typography";
import { aiWorkflow } from "@/content/ai-workflow";
import { visibleProjects } from "@/content/projects";
import { ProjectCard } from "@/features/projects/project-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/paths";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: "/projects",
    title: dictionary.nav.projects,
    description: dictionary.projects.lead,
  });
}

export default async function ProjectsPage() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const { projects } = dictionary;
  const cases = visibleProjects();

  return (
    <Container className="py-14 lg:py-20">
      <SectionHeading
        as="h1"
        eyebrow={projects.eyebrow}
        title={projects.title}
        lead={projects.lead}
      />

      {cases.length > 0 ? (
        <ul className="mt-12 grid gap-6">
          {cases.map((project, index) => (
            <li key={project.slug}>
              <ProjectCard
                project={project}
                locale={locale}
                copy={projects}
                eager={index === 0}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-12 rounded-3xl border border-dashed border-ink-3/40 bg-surface/60 px-6 py-14 text-center sm:px-12">
          <h2 className="text-2xl font-bold tracking-[-0.02em] text-ink">
            {projects.emptyTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-2">
            {projects.emptyText}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink
              href={localizePath(locale, "/expertise")}
              variant="secondary"
            >
              {dictionary.nav.expertise}
            </ButtonLink>
            <ButtonLink href={localizePath(locale, "/architecture")}>
              {dictionary.nav.playground}
            </ButtonLink>
          </div>
        </div>
      )}

      <section
        id="ai-workflow"
        aria-labelledby="ai-workflow-heading"
        className="mt-20 scroll-mt-24 rounded-3xl border border-line bg-surface px-6 py-10 sm:px-10"
      >
        <Eyebrow>{aiWorkflow.eyebrow[locale]}</Eyebrow>
        <h2
          id="ai-workflow-heading"
          className="mt-4 text-3xl font-bold tracking-[-0.02em] text-ink"
        >
          {aiWorkflow.title[locale]}
        </h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">
          {aiWorkflow.lead[locale]}
        </p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {aiWorkflow.steps.map((step, index) => (
            <li
              key={step.title.en}
              className="rounded-2xl border border-line bg-bg p-5"
            >
              <p className="font-mono text-xs text-ink-3">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 font-bold text-ink">{step.title[locale]}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                {step.text[locale]}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-6 font-mono text-[13px] text-ink-3">
          {aiWorkflow.tools.join(" · ")}
        </p>
        <p className="mt-3 max-w-3xl text-sm font-semibold text-ink">
          {aiWorkflow.principle[locale]}
        </p>
      </section>
    </Container>
  );
}

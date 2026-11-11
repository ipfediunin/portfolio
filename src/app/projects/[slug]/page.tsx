import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
} from "@/components/ui/icons";
import { Eyebrow } from "@/components/ui/typography";
import { caseNumber, findProject, visibleProjects } from "@/content/projects";
import { servicesForCase } from "@/content/services";
import { findTechnology } from "@/content/stack";
import { CaseDemo } from "@/features/cases/case-demo";
import { CaseGlanceStrip, GlanceSteps } from "@/features/cases/case-glance";
import { SCENARIO_PARAM } from "@/features/playground/scenario-param";
import { getDictionary, getLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/paths";
import { pageMetadata } from "@/lib/metadata";
import { siteUrl } from "@/lib/site-url";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { scenarioIds } from "@/simulation/scenarios/catalog";

/**
 * Everything here depends on the case (copy, its world, the demo, the MDX story), so there is no
 * shared shell to show first; the pages are static, so waiting for one is instant in practice.
 */
export const instant = false;

/**
 * With Cache Components a dynamic route must prerender at least one page. While every case is a
 * draft (hidden in production) the route is validated on this placeholder, which is a 404; real
 * slugs are kebab-case, so it can never match one.
 */
const NO_PUBLISHED_CASES = "_none";

export async function generateStaticParams() {
  const params = visibleProjects().map((project) => ({ slug: project.slug }));
  return params.length > 0 ? params : [{ slug: NO_PUBLISHED_CASES }];
}

export async function generateMetadata({
  params,
}: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = findProject(slug);
  if (!project) notFound();
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return {
    ...pageMetadata({
      locale,
      dictionary,
      path: `/projects/${project.slug}`,
      title: project.title,
      description: project.summary[locale],
    }),
    // Drafts are reachable in development only; keep them out of any index regardless.
    ...(project.published ? {} : { robots: { index: false, follow: false } }),
  };
}

const sectionTitle = "font-mono text-xs tracking-[0.14em] text-ink-3 uppercase";

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const project = findProject(slug);
  if (!project) notFound();
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const copy = dictionary.projects;
  const { default: Story } = await import(
    `@/content/cases/${project.slug}.${locale}.mdx`
  );

  const stackLinks = project.technologies.flatMap((id) => {
    const entry = findTechnology(id);
    return entry
      ? [
          {
            name: entry.technology.name,
            href: localizePath(locale, `/expertise/${entry.area.id}`),
          },
        ]
      : [];
  });
  const scenarios = scenarioIds.filter((id) => project.scenarios.includes(id));
  const relatedServices = servicesForCase(project.slug).map((service) => ({
    title: service.title,
    href: localizePath(
      locale,
      service.landing
        ? `/services/${service.slug}`
        : `/hire#service-${service.slug}`,
    ),
  }));
  const url = new URL(
    localizePath(locale, `/projects/${project.slug}`),
    siteUrl,
  ).toString();

  const title = (
    <header>
      <Link
        href={localizePath(locale, "/projects")}
        className="inline-flex h-10 items-center text-sm font-medium text-ink-2 transition-colors hover:text-ink lg:h-5 lg:text-xs"
      >
        ← {copy.back}
      </Link>
      {project.published ? null : (
        <p
          role="note"
          className="mt-4 rounded-xl border border-status-retry/30 bg-status-retry/10 px-4 py-3 text-sm text-ink lg:mt-2 lg:px-3 lg:py-1.5 lg:text-xs"
        >
          {copy.draft}
        </p>
      )}
      <Eyebrow className="mt-6 lg:mt-1 lg:text-[11px]">
        {copy.caseEyebrow} {caseNumber(project)} · {project.direction}
      </Eyebrow>
      <h1 className="mt-4 text-4xl leading-[1.08] font-bold tracking-[-0.025em] text-balance text-ink sm:text-5xl lg:mt-1.5 lg:text-[2.25rem]">
        {project.title}
      </h1>
      <p className="mt-3 text-xl font-semibold text-ink-2 lg:mt-1 lg:text-[15px]">
        {project.subtitle[locale]}
      </p>
    </header>
  );

  const intro = (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
      <section aria-labelledby="overview-heading" className="max-w-3xl">
        <h2 id="overview-heading" className={sectionTitle}>
          {copy.overview}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          {project.summary[locale]}
        </p>
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-2">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
          {copy.basis[project.basis]}
        </p>
        {project.note ? (
          <p className="mt-5 rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink-2">
            {project.note[locale]}
          </p>
        ) : null}
        {project.links.length > 0 ? (
          <ul aria-label={copy.links} className="mt-6 flex flex-wrap gap-3">
            {project.links.map((link) => (
              <li key={link.id}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-ink-3/50"
                >
                  {link.label}
                  <ArrowUpRightIcon className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {project.metrics.length > 0 ? (
          <section aria-labelledby="results-heading" className="mt-10">
            <h2 id="results-heading" className={sectionTitle}>
              {copy.results}
            </h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {project.metrics.map((metric) => (
                <li
                  key={metric.value + metric.label.en}
                  className="rounded-2xl border border-line bg-surface p-5"
                >
                  <p className="text-3xl font-bold tracking-[-0.02em] text-ink">
                    {metric.value}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                    {metric.label[locale]}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="mt-6 text-xs leading-relaxed text-ink-3">
          {copy.glance.modelNote}
        </p>
      </section>
      <GlanceSteps title={copy.glance.did} items={project.glance.did} />
    </div>
  );

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          name: project.title,
          alternativeHeadline: project.subtitle[locale],
          description: project.summary[locale],
          inLanguage: "en",
          url,
          keywords: project.stack.join(", "),
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: dictionary.nav.projects, path: "/projects" },
          { name: project.title, path: `/projects/${project.slug}` },
        ])}
      />

      {/* Full width from the top: on desktops the case world fills the first screen. */}
      <div className="mx-auto w-full max-w-7xl px-4 pt-10 sm:px-6 lg:max-w-none lg:px-0 lg:pt-0">
        <CaseDemo
          project={project}
          locale={locale}
          dictionary={dictionary}
          title={title}
          intro={intro}
          glance={
            <CaseGlanceStrip glance={project.glance} copy={copy.glance} />
          }
        />
      </div>

      <Container className="pb-14 lg:pb-20">
        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {/* The full story stays in the page (and in search) for engineers, folded under the glance. */}
          <details className="disclosure group self-start rounded-3xl border border-line bg-surface">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-3xl p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-lg font-bold tracking-[-0.01em] text-ink">
                  {copy.details.title}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-2">
                  {copy.details.hint}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink-2 transition-transform duration-300 ease-ui group-open:rotate-180"
              >
                <ChevronDownIcon className="size-5" />
              </span>
            </summary>
            <div className="border-t border-line">
              <article className="max-w-3xl px-5 pt-8 pb-10 sm:px-8">
                <Story />
              </article>
            </div>
          </details>

          <aside className="space-y-8 lg:sticky lg:top-28 lg:self-start">
            <section aria-labelledby="stack-heading">
              <h2 id="stack-heading" className={sectionTitle}>
                {copy.stack}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {project.stack.map((name) => (
                  <li
                    key={name}
                    className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink-2"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </section>

            {stackLinks.length > 0 ? (
              <section aria-labelledby="stack-links-heading">
                <h2 id="stack-links-heading" className={sectionTitle}>
                  {copy.stackLinks}
                </h2>
                <ul className="mt-3 space-y-1">
                  {stackLinks.map((link) => (
                    <li key={link.name}>
                      <Link
                        href={link.href}
                        className="group flex min-h-10 items-center justify-between gap-3 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
                      >
                        {link.name}
                        <ArrowRightIcon className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-brand" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {relatedServices.length > 0 ? (
              <section aria-labelledby="services-heading">
                <h2 id="services-heading" className={sectionTitle}>
                  {copy.relatedServices}
                </h2>
                <ul className="mt-3 space-y-1">
                  {relatedServices.map((service) => (
                    <li key={service.href}>
                      <Link
                        href={service.href}
                        className="group flex min-h-10 items-center justify-between gap-3 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
                      >
                        {service.title}
                        <ArrowRightIcon className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-brand" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {scenarios.length > 0 ? (
              <section aria-labelledby="scenarios-heading">
                <h2 id="scenarios-heading" className={sectionTitle}>
                  {copy.scenarios}
                </h2>
                <ul className="mt-3 space-y-2">
                  {scenarios.map((id) => (
                    <li key={id}>
                      <Link
                        href={`${localizePath(locale, "/architecture")}?${SCENARIO_PARAM}=${id}`}
                        className="group flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand/40 hover:bg-brand/5"
                      >
                        {dictionary.playground.scenarios[id].title}
                        <ArrowRightIcon className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-brand" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>

        <section className="mt-16 rounded-3xl bg-ink px-6 py-10 text-center sm:px-12">
          <h2 className="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
            {copy.ctaTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">{copy.ctaText}</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <ButtonLink
              href={`${localizePath(locale, "/contact")}?topic=project`}
              size="lg"
            >
              {copy.ctaButton}
            </ButtonLink>
            <Link
              href={localizePath(locale, "/for-employers")}
              className="inline-flex min-h-11 items-center font-semibold text-white/80 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
            >
              {copy.ctaRole}
            </Link>
          </div>
        </section>
      </Container>
    </>
  );
}

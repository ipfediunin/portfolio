import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ArrowRightIcon, ArrowUpRightIcon } from "@/components/ui/icons";
import { Eyebrow } from "@/components/ui/typography";
import { hirePage, servicePageCopy } from "@/content/hire";
import { visibleProjects } from "@/content/projects";
import { findLandingService, landingServices } from "@/content/services";
import { ContactCta } from "@/features/home/contact-cta";
import { ProjectCard } from "@/features/projects/project-card";
import { WorkProcess } from "@/features/services/work-process";
import { localizePath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";
import { pageMetadata } from "@/lib/metadata";
import { breadcrumbJsonLd, serviceJsonLd } from "@/lib/structured-data";

export async function generateStaticParams() {
  return landingServices.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const service = findLandingService(slug);
  if (!service) notFound();
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: `/services/${service.slug}`,
    title: service.landing.metaTitle,
    description: service.landing.metaDescription,
    absoluteTitle: true,
  });
}

const sectionHeadingClass =
  "text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl";

export default async function ServicePage({
  params,
}: PageProps<"/services/[slug]">) {
  const { slug } = await params;
  const service = findLandingService(slug);
  if (!service) notFound();
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const { landing } = service;
  const path = `/services/${service.slug}`;
  const visible = visibleProjects();
  const cases = service.cases.flatMap((caseSlug) =>
    visible.filter((project) => project.slug === caseSlug),
  );
  const otherServices = landingServices.filter(
    (other) => other.slug !== service.slug,
  );
  const crumbs = [
    { name: "Home", path: "/" },
    { name: dictionary.nav.clients, path: "/hire" },
    { name: service.title, path },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd
        data={serviceJsonLd({
          name: service.title,
          description: landing.metaDescription,
          path,
        })}
      />

      <Container className="pt-10 lg:pt-14">
        <nav aria-label={servicePageCopy.breadcrumbs}>
          <ol className="flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
            {crumbs.map((crumb, index) => (
              <li key={crumb.path} className="flex items-center gap-2">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {index < crumbs.length - 1 ? (
                  <Link
                    href={localizePath(locale, crumb.path)}
                    className="inline-flex min-h-10 items-center transition-colors hover:text-ink"
                  >
                    {crumb.name}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-ink-2">
                    {crumb.name}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <header className="mt-6 max-w-3xl">
          <Eyebrow>{hirePage.eyebrow}</Eyebrow>
          <h1 className="mt-4 text-4xl leading-[1.08] font-bold tracking-[-0.025em] text-balance text-ink sm:text-5xl">
            {landing.title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            {landing.lead}
          </p>
        </header>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <ButtonLink
            href={`${localizePath(locale, "/contact")}?topic=project`}
            size="lg"
          >
            {hirePage.primaryCta}
            <ArrowUpRightIcon className="size-5" />
          </ButtonLink>
          {cases.length > 0 ? (
            <ButtonLink href="#cases-heading" size="lg" variant="secondary">
              {hirePage.secondaryCta}
            </ButtonLink>
          ) : null}
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-2">
          {landing.sections.map((section, index) => (
            <section
              key={section.title}
              aria-labelledby={`section-${index}`}
              className={
                section.items.length === 0
                  ? "max-w-3xl lg:col-span-2"
                  : undefined
              }
            >
              <h2 id={`section-${index}`} className={sectionHeadingClass}>
                {section.title}
              </h2>
              {section.paragraph ? (
                <p className="mt-4 text-lg leading-relaxed text-ink-2">
                  {section.paragraph}
                </p>
              ) : null}
              {section.items.length > 0 ? (
                <ul className="mt-4 list-disc space-y-2.5 pl-5 leading-relaxed text-ink-2 marker:text-brand">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <section aria-labelledby="technologies-heading" className="mt-16">
          <h2 id="technologies-heading" className={sectionHeadingClass}>
            {servicePageCopy.technologies}
          </h2>
          <ul className="mt-5 flex flex-wrap gap-2">
            {service.technologies.map((name) => (
              <li
                key={name}
                className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink-2"
              >
                {name}
              </li>
            ))}
          </ul>
        </section>

        {cases.length > 0 ? (
          <section
            aria-labelledby="cases-heading"
            className="mt-16 scroll-mt-28"
          >
            <h2 id="cases-heading" className={sectionHeadingClass}>
              {servicePageCopy.cases}
            </h2>
            <p className="mt-3 max-w-3xl text-lg text-ink-2">
              {servicePageCopy.casesLead}
            </p>
            <ul className="mt-8 grid gap-6">
              {cases.map((project) => (
                <li key={project.slug}>
                  <ProjectCard
                    project={project}
                    locale={locale}
                    copy={dictionary.projects}
                    headingLevel="h3"
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-16">
          <WorkProcess headingId="process-heading" />
        </div>

        <section aria-labelledby="faq-heading" className="mt-16 max-w-3xl">
          <h2 id="faq-heading" className={sectionHeadingClass}>
            {servicePageCopy.faq}
          </h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {landing.faq.map((item) => (
              <div key={item.question} className="py-5">
                <h3 className="text-lg font-bold text-ink">{item.question}</h3>
                <p className="mt-2 leading-relaxed text-ink-2">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <nav aria-labelledby="other-services-heading" className="mt-16">
          <h2 id="other-services-heading" className={sectionHeadingClass}>
            {servicePageCopy.otherServices}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {otherServices.map((other) => (
              <li key={other.slug}>
                <Link
                  href={localizePath(locale, `/services/${other.slug}`)}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand/30"
                >
                  <span className="font-bold text-ink">{other.title}</span>
                  <span className="mt-1 text-sm text-ink-2">
                    {other.summary}
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={localizePath(locale, "/hire")}
                className="group flex h-full items-center justify-between gap-3 rounded-2xl border border-dashed border-ink-3/40 p-5 font-bold text-ink transition-colors hover:border-brand/40"
              >
                {servicePageCopy.allServices}
                <ArrowRightIcon className="size-4 text-brand transition-transform duration-300 ease-ui group-hover:translate-x-0.5" />
              </Link>
            </li>
          </ul>
        </nav>
      </Container>

      <div className="mt-20">
        <ContactCta
          locale={locale}
          content={hirePage.contact}
          topic="project"
          placement={`service-${service.slug}`}
          bookingLabel={dictionary.contact.booking}
        />
      </div>
    </>
  );
}

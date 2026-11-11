import type { Metadata } from "next";

import { JsonLd } from "@/components/json-ld";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ArrowRightIcon, ArrowUpRightIcon } from "@/components/ui/icons";
import { SectionHeading } from "@/components/ui/typography";
import { hirePage } from "@/content/hire";
import { visibleProjects } from "@/content/projects";
import { services } from "@/content/services";
import { ContactCta } from "@/features/home/contact-cta";
import { ServiceCard } from "@/features/services/service-card";
import { WorkProcess } from "@/features/services/work-process";
import { localizePath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";
import { pageMetadata } from "@/lib/metadata";
import { breadcrumbJsonLd } from "@/lib/structured-data";

const PATH = "/hire";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: PATH,
    title: hirePage.metaTitle,
    description: hirePage.metaDescription,
    absoluteTitle: true,
  });
}

export default async function HirePage() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const visible = visibleProjects();
  const casesOf = (slugs: readonly string[]) =>
    slugs.flatMap((slug) => visible.filter((project) => project.slug === slug));

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: dictionary.nav.clients, path: PATH },
        ])}
      />

      <Container className="pt-14 lg:pt-20">
        <SectionHeading
          as="h1"
          eyebrow={hirePage.eyebrow}
          title={hirePage.title}
          lead={hirePage.lead}
        />
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <ButtonLink
            href={`${localizePath(locale, "/contact")}?topic=project`}
            size="lg"
          >
            {hirePage.primaryCta}
            <ArrowUpRightIcon className="size-5" />
          </ButtonLink>
          <ButtonLink
            href={localizePath(locale, "/projects")}
            size="lg"
            variant="secondary"
          >
            {hirePage.secondaryCta}
            <ArrowRightIcon className="size-5" />
          </ButtonLink>
        </div>

        <section aria-labelledby="services-heading" className="mt-16">
          <h2
            id="services-heading"
            className="text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl"
          >
            {hirePage.servicesTitle}
          </h2>
          <ul className="mt-8 grid gap-6 lg:grid-cols-2">
            {services.map((service) => (
              <li key={service.slug}>
                <ServiceCard
                  service={service}
                  cases={casesOf(service.cases)}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-16">
          <WorkProcess headingId="process-heading" />
        </div>

        <section
          aria-labelledby="start-heading"
          className="mt-16 max-w-3xl rounded-3xl border border-line bg-surface p-6 sm:p-8"
        >
          <h2
            id="start-heading"
            className="text-2xl font-bold tracking-[-0.02em] text-ink"
          >
            {hirePage.startTitle}
          </h2>
          <p className="mt-3 text-ink-2">{hirePage.startLead}</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-2 marker:text-brand">
            {hirePage.startItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </Container>

      <div className="mt-20">
        <ContactCta
          locale={locale}
          content={hirePage.contact}
          topic="project"
          placement="hire"
          bookingLabel={dictionary.contact.booking}
        />
      </div>
    </>
  );
}

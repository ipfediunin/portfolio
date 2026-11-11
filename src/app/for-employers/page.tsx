import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  DocumentIcon,
} from "@/components/ui/icons";
import { SectionHeading } from "@/components/ui/typography";
import { employerPage, knowsAbout } from "@/content/employers";
import { visibleProjects } from "@/content/projects";
import { siteConfig } from "@/content/site";
import { OwnerIdentity } from "@/features/about/owner-identity";
import { ProfileGrid } from "@/features/about/profile-grid";
import { TrackedLink } from "@/features/analytics/tracked-link";
import { ContactCta } from "@/features/home/contact-cta";
import { ProjectCard } from "@/features/projects/project-card";
import { localizePath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";
import { pageMetadata } from "@/lib/metadata";
import { breadcrumbJsonLd, personJsonLd } from "@/lib/structured-data";

const PATH = "/for-employers";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: PATH,
    title: employerPage.metaTitle,
    description: employerPage.metaDescription,
    absoluteTitle: true,
  });
}

const sectionHeadingClass =
  "text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl";

export default async function ForEmployersPage() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const page = employerPage;
  const visible = visibleProjects();
  const cases = page.cases.slugs.flatMap((slug) =>
    visible.filter((project) => project.slug === slug),
  );
  const { resumeUrl, profiles } = siteConfig;
  const person = personJsonLd(knowsAbout);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: dictionary.nav.employers, path: PATH },
        ])}
      />
      {person ? <JsonLd data={person} /> : null}

      <Container className="pt-14 lg:pt-20">
        <SectionHeading
          as="h1"
          eyebrow={page.eyebrow}
          title={page.title}
          lead={page.lead}
        />
        <OwnerIdentity copy={dictionary.about} className="mt-8" />
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <ButtonLink
            href={`${localizePath(locale, "/contact")}?topic=role`}
            size="lg"
          >
            {page.contact.cta}
            <ArrowUpRightIcon className="size-5" />
          </ButtonLink>
          {resumeUrl ? (
            <TrackedLink
              href={resumeUrl}
              event="Resume download"
              placement="for-employers"
              download
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-6 font-semibold text-ink transition-colors hover:border-ink-3/50"
            >
              <DocumentIcon className="size-5" />
              {page.links.resume}
            </TrackedLink>
          ) : null}
        </div>

        <section aria-labelledby="roles-heading" className="mt-16">
          <h2 id="roles-heading" className={sectionHeadingClass}>
            {page.roles.title}
          </h2>
          <ul className="mt-6 flex flex-wrap gap-3">
            {page.roles.items.map((role) => (
              <li
                key={role}
                className="rounded-xl border border-line bg-surface px-4 py-3 font-semibold text-ink"
              >
                {role}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-ink-2">{page.roles.note}</p>
        </section>

        <section aria-labelledby="expertise-heading" className="mt-16">
          <h2 id="expertise-heading" className={sectionHeadingClass}>
            {page.expertise.title}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {page.expertise.items.map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-line bg-surface p-6"
              >
                <h3 className="text-lg font-bold text-ink">{item.title}</h3>
                <p className="mt-2 text-ink-2">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {cases.length > 0 ? (
          <section aria-labelledby="cases-heading" className="mt-16">
            <h2 id="cases-heading" className={sectionHeadingClass}>
              {page.cases.title}
            </h2>
            <p className="mt-3 max-w-3xl text-lg text-ink-2">
              {page.cases.lead}
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
            <Link
              href={localizePath(locale, "/projects")}
              className="mt-6 inline-flex items-center gap-1.5 font-semibold text-brand"
            >
              {page.cases.all}
              <ArrowRightIcon className="size-4" />
            </Link>
          </section>
        ) : null}

        <section aria-labelledby="stack-heading" className="mt-16">
          <h2 id="stack-heading" className={sectionHeadingClass}>
            {page.stackTitle}
          </h2>
          <ProfileGrid groups={dictionary.about.profile} />
        </section>

        <section aria-labelledby="approach-heading" className="mt-16">
          <h2 id="approach-heading" className={sectionHeadingClass}>
            {page.approachTitle}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {dictionary.home.principles.items.map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-line bg-surface p-6"
              >
                <h3 className="text-lg font-bold text-ink">{item.title}</h3>
                <p className="mt-2 text-ink-2">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {profiles.length > 0 ? (
          <section aria-labelledby="links-heading" className="mt-16">
            <h2 id="links-heading" className={sectionHeadingClass}>
              {page.links.title}
            </h2>
            <ul className="mt-6 flex flex-wrap gap-3">
              {profiles.map((profile) => (
                <li key={profile.id}>
                  <TrackedLink
                    href={profile.href}
                    event="Contact click"
                    placement="for-employers"
                    external
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-ink transition-colors hover:border-brand/30 hover:text-brand"
                  >
                    {profile.label}
                    <ArrowUpRightIcon className="size-4" />
                  </TrackedLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Container>

      <div className="mt-20">
        <ContactCta
          locale={locale}
          content={page.contact}
          topic="role"
          placement="for-employers"
          bookingLabel={dictionary.contact.booking}
        />
      </div>
    </>
  );
}

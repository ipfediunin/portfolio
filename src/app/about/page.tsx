import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { ArrowRightIcon } from "@/components/ui/icons";
import { SectionHeading } from "@/components/ui/typography";
import { siteConfig } from "@/content/site";
import { OwnerIdentity } from "@/features/about/owner-identity";
import { OwnerPortrait } from "@/features/about/owner-portrait";
import { ProfileGrid } from "@/features/about/profile-grid";
import { ContactCta } from "@/features/home/contact-cta";
import { PrinciplesSection } from "@/features/home/principles-section";
import { localizePath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: "/about",
    title: dictionary.nav.about,
    description: dictionary.about.lead,
  });
}

export default async function AboutPage() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const { about } = dictionary;
  const { ownerName, ownerPhoto } = siteConfig;

  return (
    <>
      <Container className="pt-14 lg:pt-20">
        {/* Mobile order: heading, name, portrait, text. On desktop the portrait takes the right
            column next to the heading and the text. */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-16">
          <div>
            <SectionHeading
              as="h1"
              eyebrow={about.eyebrow}
              title={about.title}
              lead={about.lead}
            />
            <OwnerIdentity copy={about} className="mt-8" />
          </div>
          <OwnerPortrait
            photo={ownerPhoto}
            alt={about.photoAlt.replace("{name}", ownerName ?? siteConfig.name)}
            slotLabel={about.photoSlot}
            className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
          />
          <div className="max-w-3xl space-y-5 text-lg leading-relaxed text-ink-2">
            {about.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
        <section aria-labelledby="profile-heading" className="mt-14">
          <h2
            id="profile-heading"
            className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase"
          >
            {about.profileTitle}
          </h2>
          <ProfileGrid groups={about.profile} />
        </section>
        <nav
          aria-label={about.next}
          className="mt-14 grid gap-4 sm:grid-cols-3"
        >
          {[
            {
              href: "/projects",
              label: dictionary.nav.projects,
              hint: about.nextProjects,
            },
            {
              href: "/for-employers",
              label: dictionary.nav.employers,
              hint: dictionary.nav.employersHint,
            },
            {
              href: "/hire",
              label: dictionary.nav.clients,
              hint: dictionary.nav.clientsHint,
            },
          ].map((link) => (
            <Link
              key={link.href}
              href={localizePath(locale, link.href)}
              className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand/30"
            >
              <span className="flex items-center justify-between font-bold text-ink">
                {link.label}
                <ArrowRightIcon className="size-4 text-brand transition-transform duration-300 ease-ui group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm text-ink-2">{link.hint}</span>
            </Link>
          ))}
        </nav>
      </Container>
      <PrinciplesSection content={dictionary.home.principles} />
      <ContactCta
        locale={locale}
        content={dictionary.home.contact}
        bookingLabel={dictionary.contact.booking}
        placement="about"
      />
    </>
  );
}

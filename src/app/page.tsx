import type { Metadata } from "next";

import { JsonLd } from "@/components/json-ld";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/typography";
import { knowsAbout } from "@/content/employers";
import { ContactCta } from "@/features/home/contact-cta";
import { FactsStrip } from "@/features/home/facts-strip";
import { HeroSection } from "@/features/home/hero-section";
import { PlaygroundTeaser } from "@/features/home/playground-teaser";
import { PrinciplesSection } from "@/features/home/principles-section";
import { StackAreaCards } from "@/features/stack/stack-area-cards";
import { getDictionary, getLocale } from "@/i18n/server";
import { pageMetadata } from "@/lib/metadata";
import { personJsonLd, websiteJsonLd } from "@/lib/structured-data";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: "/",
    title: dictionary.meta.title,
    description: dictionary.meta.description,
    absoluteTitle: true,
  });
}

export default async function HomePage() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const { stack } = dictionary.home;
  const person = personJsonLd(knowsAbout);

  return (
    <>
      <JsonLd data={websiteJsonLd(dictionary.meta.description)} />
      {person ? <JsonLd data={person} /> : null}
      <HeroSection locale={locale} dictionary={dictionary} />
      <FactsStrip facts={dictionary.home.facts} />

      <section className="pt-20 lg:pt-28">
        <Container>
          <SectionHeading
            eyebrow={stack.eyebrow}
            title={stack.title}
            lead={stack.lead}
          />
          <div className="mt-12">
            <StackAreaCards locale={locale} moreLabel={stack.more} />
          </div>
        </Container>
      </section>

      <PlaygroundTeaser locale={locale} content={dictionary.home.playground} />
      <PrinciplesSection content={dictionary.home.principles} />
      <ContactCta
        locale={locale}
        content={dictionary.home.contact}
        bookingLabel={dictionary.contact.booking}
        placement="home"
      />
    </>
  );
}

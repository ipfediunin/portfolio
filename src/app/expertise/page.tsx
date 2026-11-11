import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/typography";
import { StackAreaCards } from "@/features/stack/stack-area-cards";
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
    path: "/expertise",
    title: dictionary.stack.title,
    description: dictionary.stack.lead,
  });
}

export default async function StackPage() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);

  return (
    <Container className="py-14 lg:py-20">
      <SectionHeading
        as="h1"
        eyebrow={dictionary.stack.eyebrow}
        title={dictionary.stack.title}
        lead={dictionary.stack.lead}
      />
      <div className="mt-12">
        <StackAreaCards
          locale={locale}
          moreLabel={dictionary.home.stack.more}
        />
      </div>
    </Container>
  );
}

import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/typography";
import { PRIVACY_UPDATED, privacySections } from "@/content/privacy";
import { siteConfig } from "@/content/site";
import { getDictionary, getLocale } from "@/i18n/server";
import { pageMetadata } from "@/lib/metadata";
import { readTelegramConfig } from "@/lib/server-env";

const TITLE = "Privacy notice";
const DESCRIPTION =
  "How this portfolio website handles personal data: server logs, the contact form, analytics and your rights under the GDPR.";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: "/privacy",
    title: TITLE,
    description: DESCRIPTION,
  });
}

export default function PrivacyPage() {
  const sections = privacySections({
    ownerName: siteConfig.ownerName,
    email: siteConfig.email,
    formEnabled: readTelegramConfig() !== null,
    analyticsEnabled: siteConfig.analytics !== null,
    liveApiEnabled: siteConfig.liveApiUrl !== null,
  });
  const updated = new Date(`${PRIVACY_UPDATED}T00:00:00Z`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  );

  return (
    <Container className="py-14 lg:py-20">
      <SectionHeading as="h1" eyebrow="Privacy" title={TITLE} />
      <p className="mt-5 text-ink-3">
        Last updated: <time dateTime={PRIVACY_UPDATED}>{updated}</time>
      </p>
      <div className="mt-12 max-w-3xl space-y-12">
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`privacy-${section.id}`}>
            <h2
              id={`privacy-${section.id}`}
              className="text-2xl font-bold tracking-[-0.02em] text-ink"
            >
              {section.title}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-4 leading-relaxed text-ink-2">
                {paragraph}
              </p>
            ))}
            {section.items ? (
              <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-ink-2 marker:text-brand">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </Container>
  );
}

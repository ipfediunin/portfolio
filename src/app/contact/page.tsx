import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import {
  ArrowUpRightIcon,
  CalendarIcon,
  MailIcon,
} from "@/components/ui/icons";
import { SectionHeading } from "@/components/ui/typography";
import { siteConfig } from "@/content/site";
import { TrackedLink } from "@/features/analytics/tracked-link";
import { ContactForm } from "@/features/contact/contact-form";
import { getDictionary, getLocale } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { pageMetadata } from "@/lib/metadata";
import { readTelegramConfig } from "@/lib/server-env";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: "/contact",
    title: dictionary.nav.contact,
    description: dictionary.contact.lead,
  });
}

const cardClass =
  "group flex items-center gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card transition-colors hover:border-brand/30";
const cardIconClass =
  "flex size-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand to-brand-2 text-white";
const cardLabelClass =
  "block font-mono text-xs tracking-[0.14em] text-ink-3 uppercase";

export default async function ContactPage() {
  const { contact } = await getDictionary();
  // The form appears once delivery is configured; until then the page offers direct contacts only.
  const formEnabled = readTelegramConfig() !== null;
  const { email, profiles, schedulingUrl } = siteConfig;
  const hasChannels =
    email !== null || profiles.length > 0 || schedulingUrl !== null;

  return (
    <Container className="py-14 lg:py-20">
      <SectionHeading
        as="h1"
        eyebrow={contact.eyebrow}
        title={contact.title}
        lead={contact.lead}
      />

      {!formEnabled && !hasChannels ? (
        <p
          role="status"
          className="mt-12 max-w-2xl rounded-2xl border border-dashed border-ink-3/40 bg-surface/60 p-6 text-ink-2"
        >
          {contact.unavailable}
        </p>
      ) : (
        <div
          className={cn(
            "mt-12 grid items-start gap-5",
            formEnabled && "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
          )}
        >
          {formEnabled ? (
            <section
              aria-labelledby="contact-form-heading"
              className="rounded-2xl border border-line bg-surface p-6 shadow-card"
            >
              <h2
                id="contact-form-heading"
                className="mb-6 text-2xl font-bold tracking-[-0.02em] text-ink"
              >
                {contact.form.title}
              </h2>
              <ContactForm copy={contact.form} />
            </section>
          ) : null}

          {hasChannels ? (
            <section
              aria-labelledby="contact-channels-heading"
              className={cn("grid gap-5", !formEnabled && "md:grid-cols-2")}
            >
              <h2
                id="contact-channels-heading"
                className={cn(
                  "font-mono text-xs tracking-[0.14em] text-ink-3 uppercase",
                  !formEnabled && "md:col-span-2",
                )}
              >
                {formEnabled ? contact.channels : contact.profiles}
              </h2>

              {schedulingUrl ? (
                <TrackedLink
                  href={schedulingUrl}
                  event="Scheduling click"
                  placement="contact"
                  external
                  className={cardClass}
                >
                  <span className={cardIconClass}>
                    <CalendarIcon className="size-6" />
                  </span>
                  <span>
                    <span className={cardLabelClass}>{contact.booking}</span>
                    <span className="mt-1 block text-ink-2">
                      {contact.bookingText}
                    </span>
                  </span>
                </TrackedLink>
              ) : null}

              {email ? (
                <TrackedLink
                  href={`mailto:${email}`}
                  event="Contact click"
                  placement="contact"
                  className={cardClass}
                >
                  <span className={cardIconClass}>
                    <MailIcon className="size-6" />
                  </span>
                  <span>
                    <span className={cardLabelClass}>{contact.email}</span>
                    <span className="mt-1 block text-lg font-semibold break-all text-ink">
                      {email}
                    </span>
                  </span>
                </TrackedLink>
              ) : null}

              {profiles.length > 0 ? (
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-6 py-2">
                  {profiles.map((profile) => (
                    <li key={profile.id}>
                      <TrackedLink
                        href={profile.href}
                        event="Contact click"
                        placement="contact"
                        external
                        className="flex min-h-11 items-center justify-between py-3 font-semibold text-ink transition-colors hover:text-brand"
                      >
                        {profile.label}
                        <ArrowUpRightIcon className="size-4" />
                      </TrackedLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </Container>
  );
}

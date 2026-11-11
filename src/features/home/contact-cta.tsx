import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ArrowUpRightIcon, CalendarIcon } from "@/components/ui/icons";
import { siteConfig } from "@/content/site";
import { TrackedLink } from "@/features/analytics/tracked-link";
import type { ContactTopic } from "@/features/contact/contact-schema";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localizePath } from "@/i18n/paths";

interface ContactCtaProps {
  readonly locale: Locale;
  readonly content: {
    readonly title: string;
    readonly lead: string;
    readonly cta: string;
  };
  /** Preselects the topic on the contact form: a project for clients, a role for employers. */
  readonly topic?: ContactTopic;
  /** Where the block sits, for the scheduling click event. */
  readonly placement?: string;
  readonly bookingLabel?: Dictionary["contact"]["booking"];
}

/** The closing call to action of a page; offers booking a call too once a scheduling link is set. */
export function ContactCta({
  locale,
  content,
  topic = "project",
  placement = "home",
  bookingLabel,
}: ContactCtaProps) {
  const { schedulingUrl } = siteConfig;
  return (
    <section>
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-14 text-center sm:px-12 lg:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,rgb(124_58_237/0.35),transparent_70%)]"
          />
          <h2 className="relative text-3xl font-bold tracking-[-0.025em] text-balance text-white sm:text-4xl">
            {content.title}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/70">
            {content.lead}
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink
              href={`${localizePath(locale, "/contact")}?topic=${topic}`}
              size="lg"
            >
              {content.cta}
              <ArrowUpRightIcon className="size-5" />
            </ButtonLink>
            {schedulingUrl && bookingLabel ? (
              <TrackedLink
                href={schedulingUrl}
                event="Scheduling click"
                placement={placement}
                external
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 px-6 font-semibold text-white transition-colors hover:border-white/60"
              >
                <CalendarIcon className="size-5" />
                {bookingLabel}
              </TrackedLink>
            ) : null}
          </div>
        </div>
      </Container>
    </section>
  );
}

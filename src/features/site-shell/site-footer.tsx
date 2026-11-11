import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { siteConfig } from "@/content/site";
import { TrackedLink } from "@/features/analytics/tracked-link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localizePath } from "@/i18n/paths";

import { buildNavigation, flattenNavigation } from "./navigation";

interface SiteFooterProps {
  readonly locale: Locale;
  readonly dictionary: Dictionary;
}

const footerLinkClass =
  "text-ink-2 transition-colors duration-200 hover:text-ink";
const footerHeadingClass =
  "font-mono text-xs tracking-[0.14em] text-ink-3 uppercase";

export function SiteFooter({ locale, dictionary }: SiteFooterProps) {
  const { nav, footer } = dictionary;
  const pages = [
    ...flattenNavigation(buildNavigation(locale, dictionary)).filter(
      (link) =>
        !link.href.startsWith("/for-employers") && link.href !== "/hire",
    ),
    { href: localizePath(locale, "/architecture"), label: nav.playground },
  ];

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo name={siteConfig.name} tagline={siteConfig.tagline} />
          <p className="mt-4 text-ink-2">{footer.tagline}</p>
          {siteConfig.ownerName ? (
            <p className="mt-6 text-sm text-ink-2">
              <span className="font-semibold text-ink">
                {siteConfig.ownerName}
              </span>
              <span className="block text-ink-3">{footer.legal}</span>
            </p>
          ) : null}
        </div>

        <nav aria-label={footer.navigation}>
          <h2 className={footerHeadingClass}>{footer.navigation}</h2>
          <ul className="mt-4 space-y-2.5">
            {pages.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={footerLinkClass}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={footer.workWithMe}>
          <h2 className={footerHeadingClass}>{footer.workWithMe}</h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link
                href={localizePath(locale, "/for-employers")}
                className={footerLinkClass}
              >
                {nav.employers}
              </Link>
            </li>
            <li>
              <Link
                href={localizePath(locale, "/hire")}
                className={footerLinkClass}
              >
                {nav.clients}
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className={footerHeadingClass}>{footer.contacts}</h2>
          <ul className="mt-4 space-y-2.5">
            {siteConfig.email ? (
              <li>
                <TrackedLink
                  href={`mailto:${siteConfig.email}`}
                  event="Contact click"
                  placement="footer"
                  className={footerLinkClass}
                >
                  {siteConfig.email}
                </TrackedLink>
              </li>
            ) : null}
            {siteConfig.profiles.map((profile) => (
              <li key={profile.id}>
                <TrackedLink
                  href={profile.href}
                  event="Contact click"
                  placement="footer"
                  external
                  className={footerLinkClass}
                >
                  {profile.label}
                </TrackedLink>
              </li>
            ))}
            <li>
              <Link
                href={localizePath(locale, "/contact")}
                className={footerLinkClass}
              >
                {nav.contact}
              </Link>
            </li>
            <li>
              <Link
                href={localizePath(locale, "/privacy")}
                className={footerLinkClass}
              >
                {nav.privacy}
              </Link>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}

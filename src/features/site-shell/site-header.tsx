import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { siteConfig } from "@/content/site";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localizePath } from "@/i18n/paths";

import { HomeLink } from "./home-link";
import { MobileMenu } from "./mobile-menu";
import { NavLinks } from "./nav-links";
import { buildNavigation } from "./navigation";

interface SiteHeaderProps {
  readonly locale: Locale;
  readonly dictionary: Dictionary;
}

export function SiteHeader({ locale, dictionary }: SiteHeaderProps) {
  const navigation = buildNavigation(locale, dictionary);
  const contactCta = (
    <ButtonLink href={localizePath(locale, "/contact")} variant="pill">
      {dictionary.nav.cta}
      <ArrowUpRightIcon className="size-4" />
    </ButtonLink>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-6 lg:h-20">
        <HomeLink href={localizePath(locale, "/")} className="rounded-lg">
          <Logo name={siteConfig.name} tagline={siteConfig.tagline} />
        </HomeLink>

        <nav
          aria-label={dictionary.common.mainNavigation}
          className="hidden lg:block"
        >
          <NavLinks items={navigation} />
        </nav>

        <div className="hidden items-center gap-3 lg:flex">{contactCta}</div>

        <MobileMenu
          items={navigation}
          navigationLabel={dictionary.common.mainNavigation}
          openLabel={dictionary.common.openMenu}
          closeLabel={dictionary.common.closeMenu}
          footer={contactCta}
        />
      </Container>
    </header>
  );
}

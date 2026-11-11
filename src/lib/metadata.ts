import type { Metadata } from "next";

import { siteConfig } from "@/content/site";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localizePath } from "@/i18n/paths";

interface PageMetadataInput {
  readonly locale: Locale;
  readonly dictionary: Dictionary;
  /** Site path, e.g. "/expertise/backend". */
  readonly path: string;
  /** Page title; "· IP Fediunin" (the site name) is appended unless it is a complete title of its own. */
  readonly title: string;
  readonly description: string;
  /** The home page and landing pages carry a full, search-ready title: no site-name suffix. */
  readonly absoluteTitle?: boolean;
}

/**
 * Canonical URL, Open Graph and X/Twitter card for one page. The site has one language, so there
 * are no hreflang alternates. Relative URLs resolve against `metadataBase` (the root layout), so
 * the canonical and og:url come out absolute.
 */
export function pageMetadata({
  locale,
  dictionary,
  path,
  title,
  description,
  absoluteTitle = false,
}: PageMetadataInput): Metadata {
  const url = localizePath(locale, path);
  // The site card (app/opengraph-image.tsx). A page's openGraph replaces the parent's whole object,
  // image included, so it is set again here; a segment with an opengraph-image file of its own
  // (case studies) overrides it, since file-based metadata wins over the config object.
  const image = {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    type: "image/png",
    alt: dictionary.meta.ogAlt,
  };
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale: "en_US",
      url,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

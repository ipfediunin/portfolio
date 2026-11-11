import { siteConfig } from "@/content/site";

import { siteUrl } from "./site-url";

/**
 * Schema.org data built only from confirmed facts: the site, the owner's name and profiles once
 * they are configured, breadcrumbs and services. No organisation, reviews, ratings or credentials.
 */

const absolute = (path: string) => new URL(path, siteUrl).toString();

export function websiteJsonLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: absolute("/"),
    description,
    inLanguage: "en",
  };
}

/** Null until the owner's name is configured: a Person without a real name is not useful data. */
export function personJsonLd(knowsAbout: readonly string[]) {
  if (!siteConfig.ownerName) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": absolute("/#person"),
    name: siteConfig.ownerName,
    jobTitle: siteConfig.tagline,
    url: absolute("/"),
    ...(siteConfig.profiles.length > 0
      ? { sameAs: siteConfig.profiles.map((profile) => profile.href) }
      : {}),
    knowsAbout,
  };
}

export function breadcrumbJsonLd(
  items: readonly { readonly name: string; readonly path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
}

export function serviceJsonLd({
  name,
  description,
  path,
}: {
  readonly name: string;
  readonly description: string;
  readonly path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url: absolute(path),
    serviceType: name,
    // Inline, not by @id: a reference to an entity on another page is not reliably resolved.
    ...(siteConfig.ownerName
      ? {
          provider: {
            "@type": "Person",
            name: siteConfig.ownerName,
            url: absolute("/"),
          },
        }
      : {}),
  };
}

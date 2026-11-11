/**
 * Languages the content modules are written in. The site is published in English only; the Russian
 * translations stay in the content (not served) in case a second language returns later.
 */
export const locales = ["ru", "en"] as const;

export type Locale = (typeof locales)[number];

/** The one language the site is published in. */
export const siteLocale: Locale = "en";

/** Content that exists in every content language. */
export type Localized<T = string> = Readonly<Record<Locale, T>>;

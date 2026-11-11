import { siteLocale, type Locale } from "./config";
import { en, type Dictionary } from "./dictionaries/en";

/**
 * The language of the page. The site has one public language, so this is constant; pages keep
 * asking for it, so content stays written against the locale and a second language could return.
 */
export async function getLocale(): Promise<Locale> {
  return siteLocale;
}

export async function getDictionary(): Promise<Dictionary> {
  return en;
}

import type { Locale } from "@/i18n/config";
import type { CaptionValues } from "@/simulation/cases/case-script";

/** Fills "{name}" placeholders; numbers are formatted for the page's language. */
export function formatTemplate(
  template: string,
  values: CaptionValues,
  locale: Locale,
): string {
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    if (value === undefined) return match;
    return typeof value === "number" ? numbers.format(value) : value;
  });
}

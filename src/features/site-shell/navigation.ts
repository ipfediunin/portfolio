import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localizePath } from "@/i18n/paths";

export interface NavigationLink {
  readonly kind: "link";
  readonly href: string;
  readonly label: string;
}

/** A small menu of links ("Work with me" → for employers, for clients). */
export interface NavigationGroup {
  readonly kind: "group";
  readonly label: string;
  readonly items: readonly (NavigationLink & { readonly hint: string })[];
}

export type NavigationEntry = NavigationLink | NavigationGroup;

/**
 * The main menu: Projects, Expertise, About, Work with me (employers / clients). Contact is the
 * header's call to action, so it is not repeated here.
 */
export function buildNavigation(
  locale: Locale,
  dictionary: Dictionary,
): readonly NavigationEntry[] {
  const link = (path: string, label: string): NavigationLink => ({
    kind: "link",
    href: localizePath(locale, path),
    label,
  });
  const { nav } = dictionary;
  return [
    link("/projects", nav.projects),
    link("/expertise", nav.expertise),
    link("/about", nav.about),
    {
      kind: "group",
      label: nav.work,
      items: [
        { ...link("/for-employers", nav.employers), hint: nav.employersHint },
        { ...link("/hire", nav.clients), hint: nav.clientsHint },
      ],
    },
  ];
}

/** Every page of the menu as plain links (the footer lists them flat). */
export function flattenNavigation(
  entries: readonly NavigationEntry[],
): readonly NavigationLink[] {
  return entries.flatMap((entry): readonly NavigationLink[] =>
    entry.kind === "link" ? [entry] : entry.items,
  );
}

import type { Locale } from "./config";

/**
 * A site path for the page's language. English is the only public language and lives at the root,
 * so the path comes back unprefixed: ("en", "/projects") → "/projects".
 */
export function localizePath(_locale: Locale, path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/** True when `pathname` is `href` or one of its nested pages ("/" matches only itself). */
export function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return href !== "/" && pathname.startsWith(`${href}/`);
}

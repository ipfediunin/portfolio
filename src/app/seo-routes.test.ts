import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { projects } from "@/content/projects";

import robots from "./robots";
import sitemap from "./sitemap";

const appDir = __dirname;

const dynamicSegments: Readonly<Record<string, string>> = {
  projects: "[slug]",
  expertise: "[area]",
  services: "[slug]",
};

/** The page file that serves a sitemap path. */
function pageFileFor(path: string): string {
  const [section, slug] = path.split("/").filter(Boolean);
  if (!section) return join(appDir, "page.tsx");
  if (!slug) return join(appDir, section, "page.tsx");
  return join(appDir, section, dynamicSegments[section] ?? slug, "page.tsx");
}

describe("sitemap", () => {
  const paths = sitemap().map((entry) => new URL(entry.url).pathname);

  it("lists root English URLs without locale prefixes or alternates", () => {
    for (const path of paths) expect(path).not.toMatch(/^\/(ru|en)(\/|$)/);
    for (const entry of sitemap()) expect(entry.alternates).toBeUndefined();
  });

  it("lists only routes that exist", () => {
    for (const path of paths)
      expect(existsSync(pageFileFor(path)), path).toBe(true);
  });

  it("includes the pages for both audiences and leaves drafts out", () => {
    expect(paths).toEqual(
      expect.arrayContaining(["/", "/for-employers", "/hire", "/privacy"]),
    );
    for (const project of projects)
      expect(paths.includes(`/projects/${project.slug}`), project.slug).toBe(
        project.published,
      );
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("robots", () => {
  it("keeps a build that is not marked indexable out of search engines", () => {
    // NEXT_PUBLIC_SITE_INDEXABLE is not set in tests.
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

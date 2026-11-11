import type { MetadataRoute } from "next";

import { projects } from "@/content/projects";
import { stackAreaIds } from "@/content/schema";
import { landingServices } from "@/content/services";
import { siteUrl } from "@/lib/site-url";

/** Pages with their own content. Utility routes (404) are not listed. */
const staticPaths = [
  "/",
  "/projects",
  "/expertise",
  "/architecture",
  "/architecture/report",
  "/for-employers",
  "/hire",
  "/about",
  "/contact",
  "/privacy",
] as const;

const absolute = (path: string) => new URL(path, siteUrl).toString();

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    ...staticPaths,
    ...stackAreaIds.map((area) => `/expertise/${area}`),
    ...landingServices.map((service) => `/services/${service.slug}`),
    // Drafts never reach the sitemap, even when they render in development.
    ...projects
      .filter((project) => project.published)
      .map((project) => `/projects/${project.slug}`),
  ];

  return paths.map((path) => ({
    url: absolute(path),
    priority: path === "/" ? 1 : path === "/privacy" ? 0.3 : 0.7,
  }));
}

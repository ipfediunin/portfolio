import type { MetadataRoute } from "next";

import { siteConfig } from "@/content/site";
import { siteUrl } from "@/lib/site-url";

/** Only the production deployment is crawlable; previews and staging disallow everything. */
export default function robots(): MetadataRoute.Robots {
  if (!siteConfig.indexable)
    return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}

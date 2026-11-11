import { z } from "zod";

const siteUrlSchema = z.url({ protocol: /^https?$/ });

/**
 * Canonical origin for metadata, sitemap and Open Graph URLs.
 * Set NEXT_PUBLIC_SITE_URL in production; local development falls back to localhost.
 */
export const siteUrl = new URL(
  siteUrlSchema.parse(
    // An empty value (an unset build arg) counts as unset.
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
);

import { z } from "zod";

/**
 * Owner-specific, public configuration. Every value comes from the deployment's environment (see
 * .env.example), so production data lives with the deployment and never as placeholders in code.
 * A value that is not set is simply not shown: no link points to an example domain, no button
 * offers a résumé that does not exist.
 */

const unset = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(unset, schema.optional());
const https = z.url({ protocol: /^https$/ });

/** Exported for tests; the app reads `siteConfig`. */
export const siteEnvSchema = z.object({
  NEXT_PUBLIC_OWNER_NAME: optional(z.string().trim().min(2).max(80)),
  /** Shown next to the name on the About page; a number, so it is updated once a year. */
  NEXT_PUBLIC_OWNER_AGE: optional(z.coerce.number().int().min(16).max(99)),
  /** The owner's portrait: a file in /public ("/owner.jpg"), served through next/image. */
  NEXT_PUBLIC_OWNER_PHOTO: optional(
    z
      .string()
      .regex(
        /^\/[\w./-]+\.(jpe?g|png|webp|avif)$/i,
        "Expected a file in /public such as /owner.jpg",
      ),
  ),
  NEXT_PUBLIC_CONTACT_EMAIL: optional(z.email()),
  NEXT_PUBLIC_GITHUB_URL: optional(https),
  NEXT_PUBLIC_LINKEDIN_URL: optional(https),
  NEXT_PUBLIC_TELEGRAM_URL: optional(https),
  NEXT_PUBLIC_SCHEDULING_URL: optional(https),
  /** A file in /public ("/cv.pdf") or an absolute https URL. */
  NEXT_PUBLIC_RESUME_URL: optional(
    z
      .string()
      .regex(/^(\/[\w./-]+|https:\/\/\S+)$/, "Expected /file.pdf or https://…"),
  ),
  /** The domain registered in Plausible (privacy-friendly analytics); unset: no analytics. */
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: optional(
    z
      .string()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Expected a domain like example.com"),
  ),
  /** Script of a self-hosted Plausible (e.g. in the EU); defaults to Plausible Cloud. */
  NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL: optional(https),
  /**
   * The live Orders API (backend/): the playground's "Live API" mode calls it. Plain http only
   * for local development; unset: the playground stays a simulation.
   */
  NEXT_PUBLIC_LIVE_API_URL: optional(
    z
      .url({ protocol: /^https?$/ })
      .refine(
        (url) =>
          url.startsWith("https://") ||
          /^http:\/\/(localhost|127\.0\.0\.1|[\w.-]+\.test)(:\d+)?\/?$/.test(
            url,
          ),
        "Use https, or plain http for localhost",
      )
      .transform((url) => url.replace(/\/+$/, "")),
  ),
  /** Only the production deployment sets "true"; every other build stays out of search indexes. */
  NEXT_PUBLIC_SITE_INDEXABLE: optional(z.enum(["true", "false"])),
});

// Read one by one: Next.js inlines NEXT_PUBLIC_* only when they are referenced by name.
const env = siteEnvSchema.parse({
  NEXT_PUBLIC_OWNER_NAME: process.env.NEXT_PUBLIC_OWNER_NAME,
  NEXT_PUBLIC_OWNER_AGE: process.env.NEXT_PUBLIC_OWNER_AGE,
  NEXT_PUBLIC_OWNER_PHOTO: process.env.NEXT_PUBLIC_OWNER_PHOTO,
  NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  NEXT_PUBLIC_GITHUB_URL: process.env.NEXT_PUBLIC_GITHUB_URL,
  NEXT_PUBLIC_LINKEDIN_URL: process.env.NEXT_PUBLIC_LINKEDIN_URL,
  NEXT_PUBLIC_TELEGRAM_URL: process.env.NEXT_PUBLIC_TELEGRAM_URL,
  NEXT_PUBLIC_SCHEDULING_URL: process.env.NEXT_PUBLIC_SCHEDULING_URL,
  NEXT_PUBLIC_RESUME_URL: process.env.NEXT_PUBLIC_RESUME_URL,
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
  NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL:
    process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL,
  NEXT_PUBLIC_LIVE_API_URL: process.env.NEXT_PUBLIC_LIVE_API_URL,
  NEXT_PUBLIC_SITE_INDEXABLE: process.env.NEXT_PUBLIC_SITE_INDEXABLE,
});

export type ProfileId = "github" | "linkedin" | "telegram";

export interface ProfileLink {
  readonly id: ProfileId;
  readonly label: string;
  readonly href: string;
}

const profiles: readonly ProfileLink[] = (
  [
    { id: "github", label: "GitHub", href: env.NEXT_PUBLIC_GITHUB_URL },
    { id: "linkedin", label: "LinkedIn", href: env.NEXT_PUBLIC_LINKEDIN_URL },
    { id: "telegram", label: "Telegram", href: env.NEXT_PUBLIC_TELEGRAM_URL },
  ] as const
).flatMap((profile) =>
  profile.href ? [{ ...profile, href: profile.href }] : [],
);

export const siteConfig = {
  /**
   * The site's name: the domain, after the owner's individual entrepreneurship ("IP") registered
   * in Armenia. The interactive city is called Runtime City.
   */
  name: "IP Fediunin",
  tagline: "Full-Stack & AI Engineer",
  /** The owner's real name: About page, footer, Person schema and the privacy policy. */
  ownerName: env.NEXT_PUBLIC_OWNER_NAME ?? null,
  ownerAge: env.NEXT_PUBLIC_OWNER_AGE ?? null,
  ownerPhoto: env.NEXT_PUBLIC_OWNER_PHOTO ?? null,
  email: env.NEXT_PUBLIC_CONTACT_EMAIL ?? null,
  profiles,
  schedulingUrl: env.NEXT_PUBLIC_SCHEDULING_URL ?? null,
  resumeUrl: env.NEXT_PUBLIC_RESUME_URL ?? null,
  analytics: env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
    ? {
        domain: env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
        scriptUrl:
          env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL ??
          "https://plausible.io/js/script.js",
      }
    : null,
  /** Base URL of the live Orders API, or null when the playground runs as a simulation only. */
  liveApiUrl: env.NEXT_PUBLIC_LIVE_API_URL ?? null,
  indexable: env.NEXT_PUBLIC_SITE_INDEXABLE === "true",
} as const;

export const findProfile = (id: ProfileId) =>
  siteConfig.profiles.find((profile) => profile.id === id) ?? null;

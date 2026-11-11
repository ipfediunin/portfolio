import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { siteConfig } from "@/content/site";
import { SiteFooter } from "@/features/site-shell/site-footer";
import { SiteHeader } from "@/features/site-shell/site-header";
import { StageProvider } from "@/features/stage/stage-provider";
import { getDictionary, getLocale } from "@/i18n/server";
import { siteUrl } from "@/lib/site-url";

import { jetbrainsMono, manrope } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getDictionary();
  return {
    metadataBase: siteUrl,
    title: {
      default: dictionary.meta.title,
      template: `%s · ${siteConfig.name}`,
    },
    description: dictionary.meta.description,
    applicationName: siteConfig.name,
    twitter: { card: "summary_large_image" },
    // Previews, staging and local builds stay out of search indexes; only production opts in.
    robots: siteConfig.indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#f6f8fc",
  colorScheme: "light",
};

// Queues events sent before the script loads; Plausible replays them.
const plausibleQueue =
  "window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const dictionary = await getDictionary();

  return (
    <html
      lang="en"
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {dictionary.common.skipToContent}
        </a>
        <StageProvider>
          <SiteHeader locale={locale} dictionary={dictionary} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter locale={locale} dictionary={dictionary} />
        </StageProvider>
        {siteConfig.analytics ? (
          <>
            <Script id="plausible-queue" strategy="afterInteractive">
              {plausibleQueue}
            </Script>
            <Script
              src={siteConfig.analytics.scriptUrl}
              data-domain={siteConfig.analytics.domain}
              strategy="afterInteractive"
            />
          </>
        ) : null}
      </body>
    </html>
  );
}

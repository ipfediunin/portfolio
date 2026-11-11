import Image from "next/image";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ArrowRightIcon, DocumentIcon } from "@/components/ui/icons";
import { Eyebrow } from "@/components/ui/typography";
import { siteConfig } from "@/content/site";
import { TrackedLink } from "@/features/analytics/tracked-link";
import { inspectorNodes } from "@/features/inspector/inspector-data";
import { NodeInspector } from "@/features/inspector/node-inspector";
import { ScenePoster } from "@/features/stage/scene-poster";
import { SceneViewport } from "@/features/stage/scene-viewport";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localizePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";

import { HeroRequest } from "./hero-request";

interface HeroSectionProps {
  readonly locale: Locale;
  readonly dictionary: Dictionary;
}

export function HeroSection({ locale, dictionary }: HeroSectionProps) {
  const hero = dictionary.home.hero;
  const playgroundPath = localizePath(locale, "/architecture");

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_70%_30%,rgb(124_58_237/0.08),transparent_70%)]"
      />
      <Container className="relative z-10 flex items-center pt-10 pb-4 lg:pointer-events-none lg:min-h-[min(720px,calc(100svh-5rem))] lg:pt-12 lg:pb-16">
        <div className="max-w-xl lg:pointer-events-auto lg:max-w-[34rem] xl:max-w-xl">
          {siteConfig.ownerName ? (
            <p
              className={cn(
                "mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pr-3.5 text-sm text-ink-2 shadow-card",
                siteConfig.ownerPhoto ? "pl-1" : "pl-3",
              )}
            >
              {siteConfig.ownerPhoto ? (
                // The portrait as an avatar; the name next to it says who it is, so alt is empty.
                <span className="relative shrink-0">
                  <Image
                    src={siteConfig.ownerPhoto}
                    alt=""
                    width={28}
                    height={28}
                    sizes="28px"
                    loading="eager"
                    className="size-7 rounded-full bg-ground object-cover object-[50%_18%]"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface bg-status-success"
                  />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-status-success"
                />
              )}
              <span className="font-semibold text-ink">
                {siteConfig.ownerName}
              </span>
              <span aria-hidden="true" className="text-ink-3">
                ·
              </span>
              {hero.availability}
            </p>
          ) : null}
          <Eyebrow>{hero.eyebrow}</Eyebrow>
          <h1 className="mt-5 text-4xl leading-[1.06] font-bold tracking-[-0.03em] text-balance text-ink sm:text-5xl xl:text-[3.5rem]">
            {hero.title}
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-2">
            {hero.lead}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href={localizePath(locale, "/projects")} size="lg">
              {hero.primaryCta}
              <ArrowRightIcon className="size-5" />
            </ButtonLink>
            <ButtonLink
              href={localizePath(locale, "/hire")}
              size="lg"
              variant="secondary"
            >
              {hero.secondaryCta}
            </ButtonLink>
          </div>
          <p className="mt-5 text-sm text-ink-2">
            {hero.employers}{" "}
            <Link
              href={localizePath(locale, "/for-employers")}
              className="font-semibold text-ink underline decoration-ink-3/40 underline-offset-4 transition-colors hover:decoration-ink"
            >
              {hero.employersLink}
            </Link>
          </p>
          <HeroRequest copy={hero.request} playgroundPath={playgroundPath} />
          {siteConfig.resumeUrl ? (
            <TrackedLink
              href={siteConfig.resumeUrl}
              event="Resume download"
              placement="home"
              download
              className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
            >
              <DocumentIcon className="size-5" />
              {hero.resume}
            </TrackedLink>
          ) : null}
        </div>
      </Container>

      {/* Mobile: below the text. Desktop: fills the right of the hero and fades out under the copy. */}
      <SceneViewport
        scene={{ world: "city", view: "hero" }}
        label={dictionary.scene.overviewLabel}
        poster={<ScenePoster />}
        focusInsetsLarge={{ left: 0.3 }}
        className="aspect-[5/4] w-full [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent),linear-gradient(to_bottom,transparent,#000_12%,#000_86%,transparent)] [mask-composite:intersect] sm:aspect-[16/11] lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:w-[64%] lg:[mask-image:linear-gradient(to_right,transparent,#000_26%,#000_94%,transparent),linear-gradient(to_bottom,transparent,#000_12%,#000_86%,transparent)]"
      />
      <NodeInspector
        nodes={inspectorNodes(locale, dictionary)}
        copy={dictionary.inspector}
        playgroundPath={playgroundPath}
      />
    </section>
  );
}

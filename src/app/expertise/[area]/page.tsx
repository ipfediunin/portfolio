import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";

import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/typography";
import { stackAreaIds } from "@/content/schema";
import { findStackArea, stackAreas } from "@/content/stack";
import { inspectorNodes } from "@/features/inspector/inspector-data";
import { NodeInspector } from "@/features/inspector/node-inspector";
import { PlaybackBar } from "@/features/playground/playback-bar";
import {
  DistrictPlayer,
  DistrictScenarioList,
  DistrictScene,
  type DistrictScenario,
} from "@/features/stack/district-player";
import { stackTechnologies } from "@/features/stack/stack-scene-data";
import { TechnologyList } from "@/features/stack/technology-list";
import { ScenePoster } from "@/features/stage/scene-poster";
import { SceneViewport } from "@/features/stage/scene-viewport";
import { getDictionary, getLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { pageMetadata } from "@/lib/metadata";
import { districtEntries } from "@/simulation/stories/catalog";

/**
 * Every part of this page depends on the area (copy, technologies, the district the camera shows),
 * so there is no meaningful area-independent shell to show first. The pages are static and the
 * area tabs prefetch them in full, so waiting for the page is instant in practice.
 */
export const instant = false;

export async function generateStaticParams() {
  return stackAreaIds.map((area) => ({ area }));
}

export async function generateMetadata({
  params,
}: PageProps<"/expertise/[area]">): Promise<Metadata> {
  const { area: areaId } = await params;
  const area = findStackArea(areaId);
  if (!area) notFound();

  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: `/expertise/${area.id}`,
    title: `${area.title[locale]} · ${dictionary.nav.expertise}`,
    description: area.lead[locale],
  });
}

export default async function StackAreaPage({
  params,
}: PageProps<"/expertise/[area]">) {
  const { area: areaId } = await params;
  const area = findStackArea(areaId);
  if (!area) notFound();

  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const scenarios: DistrictScenario[] = districtEntries[area.id].map((entry) =>
    entry.kind === "story"
      ? { ...entry, ...dictionary.stories[entry.id] }
      : { ...entry, ...dictionary.playground.scenarios[entry.id] },
  );
  const sectionTitle =
    "font-mono text-xs tracking-[0.14em] text-ink-3 uppercase";

  return (
    <Container className="py-14 lg:py-20">
      <nav aria-label={dictionary.stack.areasNavigation}>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href={localizePath(locale, "/expertise")}
              className="flex h-10 items-center rounded-full px-4 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
            >
              {dictionary.stack.allAreas}
            </Link>
          </li>
          {stackAreas.map((item) => {
            const current = item.id === area.id;
            return (
              <li key={item.id}>
                <Link
                  href={localizePath(locale, `/expertise/${item.id}`)}
                  prefetch
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
                    current
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-surface text-ink-2 hover:border-ink-3/50 hover:text-ink",
                  )}
                >
                  {item.title[locale]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Phone order: copy, the scene with its narration, scenarios, technologies, code. Large
          screens: everything else on the left, the district on the right, staying in view while the
          left column scrolls. */}
      <DistrictPlayer>
        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:grid-rows-[auto_auto_auto_1fr]">
          <ViewTransition
            key={`header-${area.id}`}
            name="stack-header"
            share="auto"
            enter="auto"
            default="none"
          >
            <header className="lg:col-start-1 lg:row-start-1">
              <Eyebrow>{area.tagline[locale]}</Eyebrow>
              <h1 className="mt-4 text-4xl leading-[1.08] font-bold tracking-[-0.025em] text-ink sm:text-5xl">
                {area.title[locale]}
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-ink-2">
                {area.lead[locale]}
              </p>
            </header>
          </ViewTransition>

          <div className="space-y-4 lg:sticky lg:top-28 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:self-start">
            <DistrictScene>
              <SceneViewport
                scene={{ world: "city", view: area.id }}
                label={dictionary.stack.sceneLabel}
                poster={
                  <ScenePoster scene={{ world: "city", view: area.id }} />
                }
                className="aspect-[4/3] w-full rounded-3xl border border-line bg-bg xl:aspect-[16/11]"
              />
            </DistrictScene>
            <PlaybackBar
              copy={{
                ...dictionary.playground,
                idleNote: dictionary.stack.storyIdle,
              }}
            />
          </div>

          <section
            aria-labelledby="scenarios-heading"
            className="lg:col-start-1 lg:row-start-2"
          >
            <h2 id="scenarios-heading" className={sectionTitle}>
              {dictionary.stack.scenariosTitle}
            </h2>
            <ViewTransition
              key={`scenarios-${area.id}`}
              name="stack-scenarios"
              share="auto"
              enter="auto"
              default="none"
            >
              <div className="mt-5">
                <DistrictScenarioList scenarios={scenarios} />
              </div>
            </ViewTransition>
          </section>

          <section
            aria-labelledby="technologies-heading"
            className="lg:col-start-1 lg:row-start-3"
          >
            <h2 id="technologies-heading" className={sectionTitle}>
              {dictionary.stack.technologies}
            </h2>
            <p className="mt-3 text-sm text-ink-3">
              {dictionary.stack.technologiesHint}
            </p>
            <ViewTransition
              key={`technologies-${area.id}`}
              name="stack-technologies"
              share="auto"
              enter="auto"
              default="none"
            >
              <div className="mt-5">
                <TechnologyList
                  technologies={stackTechnologies(area, locale)}
                  casesLabel={dictionary.stack.cases}
                />
              </div>
            </ViewTransition>
          </section>

          <section
            aria-labelledby="snippet-heading"
            className="lg:col-start-1 lg:row-start-4"
          >
            <h2 id="snippet-heading" className={sectionTitle}>
              {dictionary.stack.snippetTitle}
            </h2>
            <ViewTransition
              key={`snippet-${area.id}`}
              name="stack-snippet"
              share="auto"
              enter="auto"
              default="none"
            >
              <figure className="mt-5 overflow-hidden rounded-2xl border border-line bg-ink">
                <p className="border-b border-white/10 px-4 py-2.5 font-mono text-xs text-white/50">
                  {area.snippet.file}
                </p>
                <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-white/85">
                  <code>{area.snippet.code}</code>
                </pre>
                <figcaption className="border-t border-white/10 px-4 py-3 text-sm leading-relaxed text-white/60">
                  {area.snippet.caption[locale]}
                </figcaption>
              </figure>
            </ViewTransition>
          </section>
        </div>
      </DistrictPlayer>

      <NodeInspector
        nodes={inspectorNodes(locale, dictionary)}
        copy={dictionary.inspector}
        playgroundPath={localizePath(locale, "/architecture")}
      />
    </Container>
  );
}

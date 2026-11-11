import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/typography";
import { inspectorNodes } from "@/features/inspector/inspector-data";
import { Playground } from "@/features/playground/playground";
import { ScenePoster } from "@/features/stage/scene-poster";
import { localizePath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: "/architecture",
    title: dictionary.nav.playground,
    description: dictionary.architecture.lead,
  });
}

export default async function ArchitecturePage() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const { architecture } = dictionary;

  return (
    <Container className="py-14 lg:py-20">
      <SectionHeading
        as="h1"
        eyebrow={architecture.eyebrow}
        title={architecture.title}
        lead={architecture.lead}
      />
      <div className="mt-12">
        <Playground
          copy={dictionary.playground}
          sceneLabel={dictionary.scene.overviewLabel}
          poster={<ScenePoster scene={{ world: "city", view: "system" }} />}
          nodes={inspectorNodes(locale, dictionary)}
          nodesCopy={architecture.nodes}
          inspectorCopy={dictionary.inspector}
        />
      </div>
      <p className="mt-10 text-sm font-medium">
        <Link
          href={localizePath(locale, "/architecture/report")}
          className="text-brand underline-offset-4 hover:underline"
        >
          {architecture.reportLink} →
        </Link>
      </p>
    </Container>
  );
}

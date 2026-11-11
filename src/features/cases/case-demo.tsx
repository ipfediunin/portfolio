import { botsIntegrationsDemo } from "@/content/cases/bots-integrations";
import { corporateMessengerDemo } from "@/content/cases/corporate-messenger";
import { dataInfrastructureDemo } from "@/content/cases/data-infrastructure";
import { eventDrivenDemo } from "@/content/cases/event-driven";
import { knowledgeBaseDemo } from "@/content/cases/knowledge-base";
import { processAutomationDemo } from "@/content/cases/process-automation";
import { scientificDataDemo } from "@/content/cases/scientific-data";
import { webApplicationsDemo } from "@/content/cases/web-applications";
import type { CaseStudy } from "@/content/projects";
import { ScenePoster } from "@/features/stage/scene-poster";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";

import type { CaseStageInput } from "./case-stage";
import { formatTemplate } from "./format";
import { BotsIntegrationsDemo } from "./bots-integrations-demo";
import { CorporateMessengerDemo } from "./corporate-messenger-demo";
import { DataInfrastructureDemo } from "./data-infrastructure-demo";
import { EventDrivenDemo } from "./event-driven-demo";
import { KnowledgeBaseDemo } from "./knowledge-base-demo";
import { ProcessAutomationDemo } from "./process-automation-demo";
import { ScientificDataDemo } from "./scientific-data-demo";
import { WebApplicationsDemo } from "./web-applications-demo";

/**
 * The live part of a case page: its own world on the scene and a demo built for that case, with
 * the page's own blocks (title, intro, glance) laid out around and over the world. Only the demo of
 * the page's case reaches the browser (each is its own client component).
 */
export function CaseDemo({
  project,
  locale,
  dictionary,
  title,
  intro,
  glance,
}: {
  readonly project: CaseStudy;
  readonly locale: Locale;
  readonly dictionary: Dictionary;
} & Pick<CaseStageInput, "title" | "intro" | "glance">) {
  const input: CaseStageInput = {
    title,
    intro,
    glance,
    scene: project.scene,
    poster: <ScenePoster scene={project.scene} />,
    label: formatTemplate(
      dictionary.projects.sceneLabel,
      { title: project.title },
      locale,
    ),
    copy: dictionary.projects.demo,
    locale,
  };

  switch (project.slug) {
    case "knowledge-base":
      return (
        <KnowledgeBaseDemo input={input} content={knowledgeBaseDemo[locale]} />
      );
    case "scientific-data":
      return (
        <ScientificDataDemo
          input={input}
          content={scientificDataDemo[locale]}
        />
      );
    case "process-automation":
      return (
        <ProcessAutomationDemo
          input={input}
          content={processAutomationDemo[locale]}
        />
      );
    case "corporate-messenger":
      return (
        <CorporateMessengerDemo
          input={input}
          content={corporateMessengerDemo[locale]}
        />
      );
    case "event-driven":
      return (
        <EventDrivenDemo input={input} content={eventDrivenDemo[locale]} />
      );
    case "web-applications":
      return (
        <WebApplicationsDemo
          input={input}
          content={webApplicationsDemo[locale]}
        />
      );
    case "data-infrastructure":
      return (
        <DataInfrastructureDemo
          input={input}
          content={dataInfrastructureDemo[locale]}
        />
      );
    case "bots-integrations":
      return (
        <BotsIntegrationsDemo
          input={input}
          content={botsIntegrationsDemo[locale]}
        />
      );
    default:
      return null;
  }
}

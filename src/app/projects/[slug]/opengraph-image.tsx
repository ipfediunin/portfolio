import { caseNumber, findProject, visibleProjects } from "@/content/projects";
import { ogSize, renderOgCard } from "@/lib/og-card";

export const alt = "Case study card: the case title over an isometric city";
export const size = ogSize;
export const contentType = "image/png";

/**
 * One card per case, rendered at build time like the pages themselves. With no published case
 * the route still needs one param under Cache Components — the page uses the same placeholder.
 */
export async function generateStaticParams() {
  const params = visibleProjects().map((project) => ({ slug: project.slug }));
  return params.length > 0 ? params : [{ slug: "_none" }];
}

export default async function CaseOpenGraphImage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = findProject(slug);
  // The page itself answers 404 for an unknown slug; the image falls back to the site card.
  if (!project)
    return renderOgCard({
      eyebrow: "Case studies",
      title: "Full-Stack & AI Engineer",
      subtitle: "Case studies with interactive models of each system.",
    });
  return renderOgCard({
    eyebrow: `Case ${caseNumber(project)} · ${project.direction}`,
    title: project.title,
    subtitle: project.subtitle.en,
  });
}

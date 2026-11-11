import { ogSize, renderOgCard } from "@/lib/og-card";

export const alt =
  "Full-Stack & AI Engineer — an isometric city where buildings are services and roads are data flows";
export const size = ogSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: "Python · FastAPI · RAG · Next.js",
    title: "Full-Stack & AI Engineer",
    subtitle:
      "Python backends, RAG and LLM features, automation — with interactive models of the systems.",
  });
}

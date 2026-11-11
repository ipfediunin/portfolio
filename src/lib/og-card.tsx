import { ImageResponse } from "next/og";

import { siteConfig } from "@/content/site";
import { tileAreaBounds } from "@/engine/iso/bounds";
import { prismFaces } from "@/engine/iso/prism-geometry";
import { depthKey } from "@/engine/iso/projection";
import { cityGraph } from "@/simulation/graphs/city";
import { nodeCenter } from "@/simulation/model/graph";

/** Open Graph image size shared by every card. */
export const ogSize = { width: 1200, height: 630 } as const;

const toPoints = (flat: readonly number[]) =>
  flat
    .reduce<string[]>((points, value, index) => {
      if (index % 2 === 1) points.push(`${flat[index - 1]},${value}`);
      return points;
    }, [])
    .join(" ");

/** Building silhouettes of the hero district, rendered as an inline SVG data URI. */
function cityIllustration(): string {
  const depth = (node: (typeof cityGraph.nodes)[number]) =>
    depthKey(nodeCenter(node).x, nodeCenter(node).y);
  const polygons = [...cityGraph.nodes]
    .sort((a, b) => depth(a) - depth(b))
    .map((node) => {
      const faces = prismFaces({
        tileX: node.tile.x,
        tileY: node.tile.y,
        width: node.footprint.width,
        depth: node.footprint.depth,
        height: node.height,
      });
      return [
        `<polygon points="${toPoints(faces.left)}" fill="#dce3f0"/>`,
        `<polygon points="${toPoints(faces.right)}" fill="#c7d1e5"/>`,
        `<polygon points="${toPoints(faces.top)}" fill="#f1f4fa" stroke="#e3e8f1" stroke-width="2"/>`,
      ].join("");
    })
    .join("");
  const bounds = tileAreaBounds(cityGraph.views.hero.area, 180);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">${polygons}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

interface OgCardContent {
  /** Small caps line above the title. */
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
}

/**
 * The site's Open Graph card: copy on the left, the city's silhouettes on the right. Latin-only
 * text — the bundled OG font has no Cyrillic glyphs, and the site is English.
 */
export function renderOgCard({ eyebrow, title, subtitle }: OgCardContent) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "linear-gradient(135deg, #f6f8fc 0%, #eef0fb 100%)",
        padding: 72,
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: 640,
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 4,
            color: "#4f46e5",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: title.length > 32 ? 52 : 64,
            fontWeight: 700,
            lineHeight: 1.08,
            color: "#0d1530",
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 28,
            lineHeight: 1.35,
            color: "#3e4864",
          }}
        >
          {subtitle}
        </div>
      </div>
      {/* The site name (and the owner's name, once configured): link previews say whose site it is. */}
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 72,
          display: "flex",
          alignItems: "center",
          fontSize: 26,
          color: "#3e4864",
        }}
      >
        <span style={{ fontWeight: 700, color: "#0d1530" }}>
          {siteConfig.name}
        </span>
        {siteConfig.ownerName ? (
          <span style={{ marginLeft: 14 }}>· {siteConfig.ownerName}</span>
        ) : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img>, next/image is not available here */}
      <img
        src={cityIllustration()}
        alt=""
        width={520}
        height={323}
        style={{ position: "absolute", right: 48, bottom: 120 }}
      />
    </div>,
    ogSize,
  );
}

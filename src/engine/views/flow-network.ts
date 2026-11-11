import { Container, Graphics, GraphicsContext, type Sprite } from "pixi.js";

import type { FlowKind, WorldGraph } from "@/simulation/model/graph";

import type { Point2 } from "../iso/projection";
import type { BakedArt, TextureBaker } from "../rendering/texture-baker";
import { mixHex } from "../theme/color";
import type { SceneColors } from "../theme/scene-theme";
import { linkWorldPoints } from "../world/link-paths";
import { PolylinePath, type PathSample } from "../world/polyline-path";

const PARTICLE_SPACING = 120;
/** Arcs (events, pushes, internet calls) stay faint until a playground run uses them. */
const ARC_ALPHA = 0.35;
const PARTICLE_SPEED: Record<FlowKind, number> = { sync: 88, async: 58 };
/** Particles fade in and out over this distance at both ends of a link. */
const END_FADE = 26;

interface Particle {
  readonly view: Sprite;
  distance: number;
}

interface FlowLink {
  readonly path: PolylinePath;
  readonly speed: number;
  readonly particles: Particle[];
}

export interface FlowNetwork {
  /** Static glow lines and junction nodes on the ground (under buildings). */
  readonly lines: Graphics;
  /** Static arcs in the air (above buildings). */
  readonly arcs: Graphics;
  /** Moving data pulses along the ground lines. */
  readonly particles: Container;
  update(deltaMs: number): void;
  destroy(): void;
}

function particleContext(color: string): GraphicsContext {
  return new GraphicsContext()
    .roundRect(-15, -4.5, 30, 9, 4.5)
    .fill({ color, alpha: 0.26 })
    .roundRect(-9, -2, 18, 4, 2)
    .fill(mixHex(color, "#ffffff", 0.55));
}

/** Layered strokes fake a glow without runtime filters: wide + faint, medium, thin bright core. */
export function drawGlowLine(
  lines: Graphics,
  points: readonly Point2[],
  color: string,
  intensity = 1,
): void {
  const passes = [
    { width: 12, alpha: 0.09 * intensity, color },
    { width: 5, alpha: 0.26 * intensity, color },
    { width: 1.8, alpha: intensity, color: mixHex(color, "#ffffff", 0.3) },
  ];
  for (const pass of passes) {
    const [first, ...rest] = points;
    if (!first) continue;
    lines.moveTo(first.x, first.y);
    for (const point of rest) lines.lineTo(point.x, point.y);
    lines.stroke({
      width: pass.width,
      color: pass.color,
      alpha: pass.alpha,
      join: "round",
      cap: "round",
    });
  }
}

function drawJunction(lines: Graphics, point: Point2, color: string): void {
  lines.circle(point.x, point.y, 7).fill({ color, alpha: 0.16 });
  lines
    .circle(point.x, point.y, 3.4)
    .fill("#ffffff")
    .stroke({ color, width: 1.8 });
}

export function createFlowNetwork(
  graph: WorldGraph,
  colors: SceneColors,
  { animated }: { readonly animated: boolean },
  baker: TextureBaker,
): FlowNetwork {
  const flowColor: Record<FlowKind, string> = {
    sync: colors.flowSync,
    async: colors.flowAsync,
  };
  const contexts: Record<FlowKind, GraphicsContext> = {
    sync: particleContext(colors.flowSync),
    async: particleContext(colors.flowAsync),
  };
  const arts: Record<FlowKind, BakedArt> = {
    sync: baker.fromContext(contexts.sync),
    async: baker.fromContext(contexts.async),
  };

  const lines = new Graphics({ label: "flow-lines" });
  const arcs = new Graphics({ label: "flow-arcs" });
  const particles = new Container({ label: "flow-particles" });
  const links: FlowLink[] = [];

  // Async lines first: sync request paths are the main story and sit on top.
  // Quiet links stay invisible at rest; runs and focus mode draw them when they matter.
  const ordered = graph.links
    .filter((link) => !link.quiet)
    .sort((a, b) => (a.flow === b.flow ? 0 : a.flow === "async" ? -1 : 1));
  const roads = ordered.filter((link) => link.shape !== "arc");
  for (const link of ordered) {
    if (link.shape === "arc") {
      drawGlowLine(
        arcs,
        linkWorldPoints(link),
        flowColor[link.flow],
        ARC_ALPHA,
      );
    } else {
      drawGlowLine(lines, linkWorldPoints(link), flowColor[link.flow]);
    }
  }
  for (const link of roads) {
    const points = linkWorldPoints(link);
    for (const point of points.slice(1, -1))
      drawJunction(lines, point, flowColor[link.flow]);
    const end = points.at(-1);
    if (end) drawJunction(lines, end, flowColor[link.flow]);

    if (!animated) continue;
    const path = new PolylinePath(points);
    const count = Math.max(2, Math.round(path.length / PARTICLE_SPACING));
    const linkParticles = Array.from({ length: count }, (_, index) => {
      const view = arts[link.flow].createSprite();
      particles.addChild(view);
      return { view, distance: (index / count) * path.length };
    });
    links.push({
      path,
      speed: PARTICLE_SPEED[link.flow],
      particles: linkParticles,
    });
  }

  const sample: PathSample = { x: 0, y: 0, directionX: 1, directionY: 0 };

  function place(link: FlowLink, particle: Particle): void {
    link.path.sampleAt(particle.distance, sample);
    particle.view.position.set(sample.x, sample.y);
    particle.view.rotation = Math.atan2(sample.directionY, sample.directionX);
    const toEnd = Math.min(
      particle.distance,
      link.path.length - particle.distance,
    );
    particle.view.alpha = Math.min(1, toEnd / END_FADE);
  }

  for (const link of links)
    for (const particle of link.particles) place(link, particle);

  return {
    lines,
    arcs,
    particles,
    update(deltaMs) {
      const seconds = deltaMs / 1000;
      for (const link of links) {
        for (const particle of link.particles) {
          particle.distance =
            (particle.distance + link.speed * seconds) % link.path.length;
          place(link, particle);
        }
      }
    },
    destroy() {
      lines.destroy();
      arcs.destroy();
      particles.destroy({ children: true });
      contexts.sync.destroy();
      contexts.async.destroy();
    },
  };
}

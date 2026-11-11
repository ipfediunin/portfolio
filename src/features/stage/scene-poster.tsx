import { PLATE_HEIGHT } from "@/engine/factories/buildings/shared";
import { tileAreaBounds } from "@/engine/iso/bounds";
import { groundQuad, prismFaces } from "@/engine/iso/prism-geometry";
import { depthKey, tileToWorld } from "@/engine/iso/projection";
import type { SceneRef } from "@/engine/types";
import { cityBlocks, GROUND_SURROUND } from "@/engine/world/ground-layout";
import { worldGraphs } from "@/simulation/graphs/worlds";
import {
  expandRect,
  nodeCenter,
  nodeRect,
  rectsOverlap,
  roadRect,
  type WorldGraph,
} from "@/simulation/model/graph";

// Whole pixels are plenty for a placeholder and keep the inlined SVG (and the HTML) small.
const toPoints = (flat: readonly number[]) =>
  flat
    .reduce<string[]>((points, value, index) => {
      if (index % 2 === 1)
        points.push(`${Math.round(flat[index - 1]!)},${Math.round(value)}`);
      return points;
    }, [])
    .join(" ");

const rectPoints = (
  rect: { x0: number; y0: number; x1: number; y1: number },
  elevation = 0,
) =>
  toPoints(
    groundQuad(
      rect.x0,
      rect.y0,
      rect.x1 - rect.x0,
      rect.y1 - rect.y0,
      elevation,
    ),
  );

const elevation = PLATE_HEIGHT + 5;
/** The canvas is usually wider than the framed area: draw what can show up around it, nothing more. */
const VISIBLE_MARGIN = 6;

function posterContent({ world, view }: SceneRef) {
  const graph: WorldGraph = worldGraphs[world];
  const area = (graph.views[view] ?? graph.views.system).area;
  const tallest = Math.max(...graph.nodes.map((node) => node.height));
  const bounds = tileAreaBounds(area, tallest + PLATE_HEIGHT + 60);
  const visible = expandRect(area, VISIBLE_MARGIN);
  // Only the system's own buildings: background buildings and trees appear with the live scene.
  const nodes = graph.nodes
    .filter((node) => rectsOverlap(nodeRect(node), visible))
    .sort((a, b) => {
      const ca = nodeCenter(a);
      const cb = nodeCenter(b);
      return depthKey(ca.x, ca.y) - depthKey(cb.x, cb.y);
    });
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    graph,
    ground: {
      x0: -GROUND_SURROUND,
      y0: -GROUND_SURROUND,
      x1: graph.size.width + GROUND_SURROUND,
      y1: graph.size.height + GROUND_SURROUND,
    },
    viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
    nodes,
    links: graph.links.filter(
      (link) => !link.quiet && (nodeIds.has(link.from) || nodeIds.has(link.to)),
    ),
  };
}

/**
 * Server-rendered SVG of a scene view: the same graph and projection the engine uses, in flat
 * shapes. Shown before the engine loads and kept as the fallback without WebGL. Rendering it on the
 * server keeps the graph, its schema and the geometry out of the client bundle.
 */
export function ScenePoster({
  scene = { world: "city", view: "hero" },
}: {
  readonly scene?: SceneRef;
}) {
  const { graph, ground, viewBox, nodes, links } = posterContent(scene);
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      className="size-full overflow-visible"
    >
      <polygon points={rectPoints(ground)} fill="var(--color-ground)" />
      {graph.roads.map((road) => (
        <polygon
          key={road.id}
          points={rectPoints(roadRect(road))}
          fill="var(--color-road)"
        />
      ))}
      {cityBlocks(graph).map((block) => (
        <polygon
          key={`${block.x0}:${block.y0}`}
          points={rectPoints(expandRect(block, -0.06), PLATE_HEIGHT)}
          fill="var(--color-plate)"
        />
      ))}
      {nodes.map((node) => (
        <polygon
          key={`grass-${node.id}`}
          points={rectPoints(expandRect(nodeRect(node), 0.28), PLATE_HEIGHT)}
          fill="var(--color-grass)"
        />
      ))}
      {links.map((link) => (
        <polyline
          key={link.id}
          points={link.route
            .map((point) => {
              const world = tileToWorld(point.x, point.y);
              return `${Math.round(world.x)},${Math.round(world.y - 2)}`;
            })
            .join(" ")}
          fill="none"
          stroke={
            link.flow === "sync"
              ? "var(--color-flow-sync)"
              : "var(--color-flow-async)"
          }
          strokeWidth={2}
          strokeOpacity={0.7}
        />
      ))}
      {nodes.map((node) => {
        const faces = prismFaces({
          tileX: node.tile.x,
          tileY: node.tile.y,
          width: node.footprint.width,
          depth: node.footprint.depth,
          height: node.height,
          elevation,
        });
        return (
          <g key={node.id}>
            <polygon
              points={toPoints(faces.left)}
              fill="var(--color-building-left)"
            />
            <polygon
              points={toPoints(faces.right)}
              fill="var(--color-building-right)"
            />
            <polygon
              points={toPoints(faces.top)}
              fill="var(--color-building-top)"
            />
          </g>
        );
      })}
    </svg>
  );
}

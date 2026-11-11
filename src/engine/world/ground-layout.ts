import type { WorldGraph, TileRect } from "@/simulation/model/graph";

/** Extra ground around the map so the city fades out instead of ending at an edge. */
export const GROUND_SURROUND = 12;

/** Block rectangles between consecutive roads (assumes a grid of full-length x and y roads). */
export function cityBlocks(graph: WorldGraph): TileRect[] {
  const lines = (axis: "x" | "y") =>
    graph.roads
      .filter((road) => road.axis === axis)
      .map((road) => road.line)
      .sort((a, b) => a - b);
  const xRanges = ranges(lines("y"), graph.size.width);
  const yRanges = ranges(lines("x"), graph.size.height);
  return xRanges.flatMap(([x0, x1]) =>
    yRanges.map(([y0, y1]) => ({ x0, y0, x1, y1 })),
  );
}

function ranges(lines: readonly number[], size: number): [number, number][] {
  const edges = [
    -GROUND_SURROUND,
    ...lines.flatMap((line) => [line, line + 1]),
    size + GROUND_SURROUND,
  ];
  const result: [number, number][] = [];
  for (let index = 0; index < edges.length; index += 2)
    result.push([edges[index]!, edges[index + 1]!]);
  return result;
}

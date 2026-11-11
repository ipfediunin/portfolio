import type { RequestJourney, WorldGraph } from "@/simulation/model/graph";

import type { Point2 } from "../iso/projection";
import { linkWorldPoints } from "./link-paths";

export interface JourneyArrival {
  /** Distance along the path at which the packet reaches the node. */
  readonly distance: number;
  readonly nodeId: string;
}

export interface JourneyPath {
  /** World-space polyline from the first node to the last one. */
  readonly points: readonly Point2[];
  readonly arrivals: readonly JourneyArrival[];
  readonly length: number;
}

function polylineLength(points: readonly Point2[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.y - points[index - 1]!.y,
    );
  }
  return length;
}

/**
 * Concatenates the journey's link routes (reversed where needed) into one outbound path and
 * records where each intermediate node is reached. The response travels the same path backwards.
 */
export function planJourneyPath(
  graph: WorldGraph,
  journey: RequestJourney,
): JourneyPath {
  const linksById = new Map(graph.links.map((link) => [link.id, link]));
  const points: Point2[] = [];
  const arrivals: JourneyArrival[] = [];

  for (const hop of journey.hops) {
    const link = linksById.get(hop.link);
    if (!link) throw new Error(`Journey uses unknown link "${hop.link}"`);
    const linkPoints = linkWorldPoints(link);
    const route = hop.reverse ? linkPoints.reverse() : linkPoints;
    for (const point of route) {
      const previous = points.at(-1);
      if (!previous || previous.x !== point.x || previous.y !== point.y)
        points.push(point);
    }
    arrivals.push({
      distance: polylineLength(points),
      nodeId: hop.reverse ? link.from : link.to,
    });
  }

  return { points, arrivals, length: polylineLength(points) };
}

/** The response path: the outbound path backwards, arriving at the nodes in reverse order. */
export function reverseJourneyPath(
  path: JourneyPath,
  originNodeId: string,
): JourneyPath {
  const points = [...path.points].reverse();
  // Walking back, the packet passes every intermediate node again, then reaches the origin.
  const arrivals = path.arrivals
    .slice(0, -1)
    .map((arrival) => ({
      distance: path.length - arrival.distance,
      nodeId: arrival.nodeId,
    }))
    .reverse();
  arrivals.push({ distance: path.length, nodeId: originNodeId });
  return { points, arrivals, length: path.length };
}

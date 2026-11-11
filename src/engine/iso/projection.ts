/**
 * 2:1 dimetric ("isometric") projection.
 *
 * Tile space: integer grid, +x runs to the lower right, +y to the lower left.
 * World space: pixels at zoom 1; the camera maps world space to screen space.
 */

export interface Point2 {
  x: number;
  y: number;
}

export const TILE_WIDTH = 128;
export const TILE_HEIGHT = 64;

const HALF_WIDTH = TILE_WIDTH / 2;
const HALF_HEIGHT = TILE_HEIGHT / 2;

/** Ground-level world position of a tile-space point. Pass `out` in hot paths to avoid allocations. */
export function tileToWorld(
  tileX: number,
  tileY: number,
  out: Point2 = { x: 0, y: 0 },
): Point2 {
  out.x = (tileX - tileY) * HALF_WIDTH;
  out.y = (tileX + tileY) * HALF_HEIGHT;
  return out;
}

/** Inverse of {@link tileToWorld} for points on the ground plane. */
export function worldToTile(
  worldX: number,
  worldY: number,
  out: Point2 = { x: 0, y: 0 },
): Point2 {
  const column = worldX / HALF_WIDTH;
  const row = worldY / HALF_HEIGHT;
  out.x = (row + column) / 2;
  out.y = (row - column) / 2;
  return out;
}

/** Painter's-order key: objects with a larger key are closer to the viewer and drawn later. */
export function depthKey(tileX: number, tileY: number): number {
  return tileX + tileY;
}

import { Container, Sprite, Texture } from "pixi.js";

import { TILE_WIDTH } from "../iso/projection";

const TEXTURE_SIZE = 128;
const BLUR = 22;
const INSET = 30;

/**
 * A blurred square drawn once with Canvas 2D (shadowBlur works in every browser, unlike ctx.filter).
 * Stretched under buildings and cards, it replaces runtime blur filters entirely.
 */
export function createSoftShadowTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Canvas 2D is unavailable for the shadow texture");

  // The rectangle is drawn off-canvas; only its blurred shadow lands inside.
  context.shadowColor = "rgba(13, 21, 48, 1)";
  context.shadowBlur = BLUR;
  context.shadowOffsetX = TEXTURE_SIZE * 2;
  context.fillRect(
    INSET - TEXTURE_SIZE * 2,
    INSET,
    TEXTURE_SIZE - INSET * 2,
    TEXTURE_SIZE - INSET * 2,
  );
  return Texture.from(canvas);
}

/** Fraction of the texture covered by the solid core, used to size shadows by their footprint. */
const CORE_FRACTION = (TEXTURE_SIZE - INSET * 2) / TEXTURE_SIZE;

/**
 * A container whose local coordinates are tile coordinates on the ground plane:
 * rotate 45°, scale to the tile diagonal, squash y by 2 — exactly the iso projection.
 */
export function createGroundPlane(elevation: number): {
  readonly plane: Container;
  readonly tiles: Container;
} {
  const plane = new Container({ label: "ground-plane" });
  plane.scale.set(1, 0.5);
  plane.y = -elevation;
  const tiles = new Container({ label: "ground-plane-tiles" });
  tiles.rotation = Math.PI / 4;
  tiles.scale.set((TILE_WIDTH / 2) * Math.SQRT2);
  plane.addChild(tiles);
  return { plane, tiles };
}

/** Soft shadow covering a tile rectangle, for use inside `createGroundPlane().tiles`. */
export function createFootprintShadow(
  texture: Texture,
  tileX: number,
  tileY: number,
  width: number,
  depth: number,
  alpha: number,
): Sprite {
  const sprite = new Sprite(texture);
  sprite.alpha = alpha;
  sprite.setSize(width / CORE_FRACTION, depth / CORE_FRACTION);
  sprite.position.set(
    tileX - (sprite.width - width) / 2,
    tileY - (sprite.height - depth) / 2,
  );
  return sprite;
}

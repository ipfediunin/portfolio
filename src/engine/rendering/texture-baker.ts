import {
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  type Container,
  type GraphicsContext,
  type Renderer,
} from "pixi.js";

/** Transparent margin so antialiased edges are not clipped by the texture frame. */
const PADDING = 3;
/** Re-bake only when the needed resolution drifts this much; small resizes reuse the textures. */
const REBAKE_THRESHOLD = 0.15;

/**
 * One piece of vector art rendered into a texture. Sprites that use it are anchored so that the
 * art's local origin lands on the sprite position, whatever frame the texture ends up with.
 */
export class BakedArt {
  texture: Texture = Texture.EMPTY;
  private readonly frame = new Rectangle(0, 0, 1, 1);
  private readonly users = new Set<Sprite>();

  constructor(
    readonly source: Container,
    readonly ownsSource: boolean,
  ) {}

  /** Creates a sprite showing this art; place it where the art's origin should be. */
  createSprite(): Sprite {
    const sprite = new Sprite();
    this.use(sprite);
    return sprite;
  }

  use(sprite: Sprite): void {
    this.users.add(sprite);
    this.apply(sprite);
  }

  release(sprite: Sprite): void {
    this.users.delete(sprite);
  }

  /** Called by the baker after the texture changed. */
  replace(texture: Texture, frame: Rectangle): void {
    this.texture = texture;
    this.frame.copyFrom(frame);
    for (const sprite of this.users) this.apply(sprite);
  }

  private apply(sprite: Sprite): void {
    sprite.texture = this.texture;
    sprite.anchor.set(
      -this.frame.x / this.frame.width,
      -this.frame.y / this.frame.height,
    );
  }
}

/**
 * Bakes static vector art into textures at the resolution it is displayed at.
 *
 * Vector Graphics are re-packed into vertex buffers every frame the batch is rebuilt; a city with
 * thousands of window quads spends most of its frame doing that. Baked, each building, tree or van
 * is a single four-vertex sprite. Re-baked when the zoom or device resolution changes noticeably.
 */
export class TextureBaker {
  private readonly arts: BakedArt[] = [];
  private resolution = 0;

  constructor(private readonly renderer: Renderer) {}

  fromContext(context: GraphicsContext): BakedArt {
    return this.add(new BakedArt(new Graphics(context), true));
  }

  fromGraphics(graphics: Graphics): BakedArt {
    return this.add(new BakedArt(graphics, true));
  }

  needsBake(resolution: number): boolean {
    return (
      this.resolution === 0 ||
      Math.abs(resolution - this.resolution) / this.resolution >
        REBAKE_THRESHOLD
    );
  }

  /** Renders every art at `resolution` (texture pixels per world unit) and swaps the textures in place. */
  bake(resolution: number): void {
    this.resolution = resolution;
    for (const art of this.arts) this.bakeArt(art);
  }

  destroy(): void {
    for (const art of this.arts) {
      if (art.texture !== Texture.EMPTY) art.texture.destroy(true);
      if (art.ownsSource) art.source.destroy();
    }
    this.arts.length = 0;
  }

  private add(art: BakedArt): BakedArt {
    // Baked art is drawn only while baking, so batching it costs nothing per frame. Left on "auto",
    // a large context (a building full of windows) is drawn on its own, and PixiJS keeps the bind
    // groups of such draws in a global cache that holds every texture they used: destroying a
    // world's gradients with it would then log "[BindGroup] ... destroyed while still bound".
    if (art.source instanceof Graphics) art.source.context.batchMode = "batch";
    this.arts.push(art);
    // Art created after the first bake (e.g. on demand) is baked right away at the current resolution.
    if (this.resolution > 0) this.bakeArt(art);
    return art;
  }

  private bakeArt(art: BakedArt): void {
    const bounds = art.source.getLocalBounds();
    const frame = new Rectangle(
      Math.floor(bounds.x - PADDING),
      Math.floor(bounds.y - PADDING),
      Math.ceil(bounds.width + PADDING * 2),
      Math.ceil(bounds.height + PADDING * 2),
    );
    const previous = art.texture;
    const texture = this.renderer.generateTexture({
      target: art.source,
      frame,
      resolution: this.resolution,
      antialias: true,
    });
    art.replace(texture, frame);
    if (previous !== Texture.EMPTY) previous.destroy(true);
  }
}

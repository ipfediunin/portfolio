/** Smoothing time constant: ~95% of the way to the target after three of these. */
const SMOOTHING_MS = 240;
const EPSILON = 0.01;

/**
 * Subtle camera drift following the mouse (desktop only). Reads the pointer from a passive
 * window listener and eases towards it inside the ticker, so it is frame-rate independent.
 */
export class PointerParallax {
  private targetX = 0;
  private targetY = 0;
  private currentX = 0;
  private currentY = 0;
  private listening = false;

  constructor(private readonly maxOffset: number) {}

  get x(): number {
    return this.currentX;
  }

  get y(): number {
    return this.currentY;
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
    const normalizedY = (event.clientY / window.innerHeight) * 2 - 1;
    this.targetX = -normalizedX * this.maxOffset;
    this.targetY = -normalizedY * this.maxOffset * 0.6;
  };

  start(): void {
    if (this.listening) return;
    window.addEventListener("pointermove", this.handlePointerMove, {
      passive: true,
    });
    this.listening = true;
  }

  stop(): void {
    window.removeEventListener("pointermove", this.handlePointerMove);
    this.listening = false;
  }

  /** Advances the easing; returns true when the offset changed enough to re-render. */
  update(deltaMs: number): boolean {
    const factor = 1 - Math.exp(-deltaMs / SMOOTHING_MS);
    const nextX = this.currentX + (this.targetX - this.currentX) * factor;
    const nextY = this.currentY + (this.targetY - this.currentY) * factor;
    const moved =
      Math.abs(nextX - this.currentX) > EPSILON ||
      Math.abs(nextY - this.currentY) > EPSILON;
    this.currentX = nextX;
    this.currentY = nextY;
    return moved;
  }
}

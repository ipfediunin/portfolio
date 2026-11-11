/** A press that moves farther than this (CSS px) is a scroll or a drag, not a tap. */
export const TAP_SLOP_PX = 10;
/** A press held longer than this is not a tap (long-press menus, hesitation). */
export const TAP_MAX_MS = 600;

interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

/**
 * Tells taps from scrolls, drags and pinches. Pure: feed it pointer down/move/up/cancel with
 * positions and timestamps; `up` answers whether the press was a tap.
 */
export class TapTracker {
  private press: Press | null = null;
  /** A second finger turns the gesture into a pinch; nothing until all fingers lift is a tap. */
  private multiTouch = false;
  private readonly down = new Set<number>();

  pointerDown(pointerId: number, x: number, y: number, at: number): void {
    this.down.add(pointerId);
    if (this.down.size > 1) {
      this.multiTouch = true;
      this.press = null;
      return;
    }
    this.press = { pointerId, x, y, at };
  }

  pointerMove(pointerId: number, x: number, y: number): void {
    const press = this.press;
    if (!press || press.pointerId !== pointerId) return;
    if (Math.hypot(x - press.x, y - press.y) > TAP_SLOP_PX) this.press = null;
  }

  /** True when this release completes a tap. */
  pointerUp(pointerId: number, x: number, y: number, at: number): boolean {
    const press = this.press;
    this.down.delete(pointerId);
    const tap =
      !this.multiTouch &&
      press !== null &&
      press.pointerId === pointerId &&
      at - press.at <= TAP_MAX_MS &&
      Math.hypot(x - press.x, y - press.y) <= TAP_SLOP_PX;
    if (press?.pointerId === pointerId) this.press = null;
    if (this.down.size === 0) this.multiTouch = false;
    return tap;
  }

  /** The browser took the gesture over (scrolling, pinch-zoom) or the pointer left. */
  pointerCancel(pointerId: number): void {
    this.down.delete(pointerId);
    if (this.press?.pointerId === pointerId) this.press = null;
    if (this.down.size === 0) this.multiTouch = false;
  }
}

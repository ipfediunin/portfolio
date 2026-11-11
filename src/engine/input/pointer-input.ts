import { TapTracker } from "./tap-tracker";

export interface PointerInputHandlers {
  /** Mouse or pen moved over the element (element-local CSS px); never fires for touch. */
  hover(x: number, y: number): void;
  /** The hovering pointer left the element. */
  hoverEnd(): void;
  /** A tap or click that did not scroll, drag or pinch. */
  tap(x: number, y: number): void;
}

/**
 * The scene's single entry point for pointer input. It never calls preventDefault, so the page
 * keeps scrolling and zooming under the finger: the browser's pointercancel ends any gesture it
 * takes over, and only clean taps reach the scene.
 */
export class PointerInput {
  private readonly tracker = new TapTracker();
  private readonly listeners: ReadonlyArray<
    readonly [keyof HTMLElementEventMap, (event: PointerEvent) => void]
  >;

  constructor(
    private readonly element: HTMLElement,
    private readonly handlers: PointerInputHandlers,
  ) {
    this.listeners = [
      ["pointermove", (event) => this.handleMove(event)],
      ["pointerdown", (event) => this.handleDown(event)],
      ["pointerup", (event) => this.handleUp(event)],
      ["pointercancel", (event) => this.tracker.pointerCancel(event.pointerId)],
      ["pointerleave", (event) => this.handleLeave(event)],
    ];
    for (const [type, listener] of this.listeners)
      element.addEventListener(type, listener as EventListener);
  }

  destroy(): void {
    for (const [type, listener] of this.listeners)
      this.element.removeEventListener(type, listener as EventListener);
  }

  private handleMove(event: PointerEvent): void {
    this.tracker.pointerMove(event.pointerId, event.offsetX, event.offsetY);
    if (event.pointerType !== "touch")
      this.handlers.hover(event.offsetX, event.offsetY);
  }

  private handleDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    this.tracker.pointerDown(
      event.pointerId,
      event.offsetX,
      event.offsetY,
      event.timeStamp,
    );
  }

  private handleUp(event: PointerEvent): void {
    if (
      this.tracker.pointerUp(
        event.pointerId,
        event.offsetX,
        event.offsetY,
        event.timeStamp,
      )
    )
      this.handlers.tap(event.offsetX, event.offsetY);
  }

  private handleLeave(event: PointerEvent): void {
    if (event.pointerType !== "touch") this.handlers.hoverEnd();
  }
}

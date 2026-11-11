import type { Container } from "pixi.js";

export interface DebugSnapshot {
  readonly tier: string;
  readonly resolution: number;
  readonly renderer: string;
}

const REFRESH_INTERVAL_MS = 250;

function countDisplayObjects(root: Container): number {
  let count = 0;
  const stack: Container[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as Container;
    count++;
    for (const child of node.children) stack.push(child);
  }
  return count;
}

/**
 * Development-only HUD (open any page with `?debug`). Writes to a DOM node a few times
 * per second instead of every frame, so measuring does not distort the measurement.
 */
export class DebugOverlay {
  private readonly element = document.createElement("div");
  private frames = 0;
  private frameTimeTotal = 0;
  private sinceRefreshMs = 0;

  constructor(
    private readonly stage: Container,
    private readonly snapshot: () => DebugSnapshot,
  ) {
    this.element.style.cssText = [
      "position:absolute",
      "top:8px",
      "left:8px",
      "z-index:1",
      "padding:4px 8px",
      "border-radius:6px",
      "background:rgb(13 21 48 / 0.82)",
      "color:#fff",
      "font:11px/1.4 ui-monospace,monospace",
      "pointer-events:none",
      "white-space:pre",
    ].join(";");
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.element);
  }

  sample(deltaMs: number): void {
    this.frames++;
    this.frameTimeTotal += deltaMs;
    this.sinceRefreshMs += deltaMs;
    if (this.sinceRefreshMs < REFRESH_INTERVAL_MS) return;

    const averageMs = this.frameTimeTotal / this.frames;
    const { tier, resolution, renderer } = this.snapshot();
    this.element.textContent =
      `FPS ${Math.round(1000 / averageMs)} · ${averageMs.toFixed(1)} ms\n` +
      `tier ${tier} · res ${resolution} · ${renderer}\n` +
      `objects ${countDisplayObjects(this.stage)}`;

    this.frames = 0;
    this.frameTimeTotal = 0;
    this.sinceRefreshMs = 0;
  }

  destroy(): void {
    this.element.remove();
  }
}

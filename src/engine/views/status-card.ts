import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";

import type { NodeStatus } from "@/simulation/model/graph";

import type { SceneColors, SceneTheme } from "../theme/scene-theme";

const PADDING_X = 11;
const PADDING_Y = 9;
const ICON_RADIUS = 8;
const HEIGHT = 50;
const APPEAR_MS = 280;
const PULSE_MS = 320;
const HIDE_MS = 320;

function statusColor(colors: SceneColors, status: NodeStatus): string {
  switch (status) {
    case "success":
      return colors.statusSuccess;
    case "processing":
      return colors.statusProcessing;
    case "queued":
      return colors.statusQueued;
    case "retry":
      return colors.statusRetry;
    case "failed":
      return colors.statusFailed;
    case "cached":
      return colors.statusCached;
  }
}

function drawGlyph(icon: Graphics, status: NodeStatus): void {
  const white = "#ffffff";
  switch (status) {
    case "success":
      icon
        .moveTo(-3.6, 0.2)
        .lineTo(-1.1, 2.7)
        .lineTo(3.6, -2.4)
        .stroke({ color: white, width: 2, cap: "round", join: "round" });
      break;
    case "failed":
      icon
        .roundRect(-1, -4.6, 2, 6, 1)
        .fill(white)
        .circle(0, 3.6, 1.15)
        .fill(white);
      break;
    case "retry":
      icon
        .arc(0, 0, 3.8, -Math.PI * 0.35, Math.PI * 1.25)
        .stroke({ color: white, width: 1.8, cap: "round" });
      icon.poly([2.4, -4.6, 4.9, -2.4, 1.6, -1.6]).fill(white);
      break;
    case "processing":
      icon
        .arc(0, 0, 3.8, 0, Math.PI * 1.5)
        .stroke({ color: white, width: 1.8, cap: "round" });
      break;
    case "cached":
      icon
        .poly([0.8, -5, -3, 0.8, -0.3, 0.8, -1, 5, 3, -1, 0.3, -1])
        .fill(white);
      break;
    case "queued":
      for (const x of [-3.4, 0, 3.4]) icon.circle(x, 0, 1.3).fill(white);
      break;
  }
}

const easeOutBack = (t: number) => {
  const overshoot = 1.6;
  const shifted = t - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
};

/**
 * Floating status card above a building, drawn in screen space so text stays crisp at any zoom.
 * Its pivot is the bottom center: position it at the anchor point above the roof.
 */
export class StatusCard {
  readonly view = new Container({ label: "status-card" });
  private readonly shadow: Sprite;
  private readonly background = new Graphics();
  private readonly icon = new Graphics();
  private readonly statusText: Text;
  private readonly labelText: Text;
  private status: NodeStatus = "success";
  /** Unscaled card size in screen pixels; the pivot is the bottom center. */
  readonly size = { width: 0, height: HEIGHT };
  private appearElapsed = Number.POSITIVE_INFINITY;
  private pulseElapsed = Number.POSITIVE_INFINITY;
  private hideElapsed = Number.POSITIVE_INFINITY;
  private iconSpin = 0;

  constructor(
    private readonly theme: SceneTheme,
    shadowTexture: Texture,
    label: string,
  ) {
    this.shadow = new Sprite(shadowTexture);
    this.shadow.alpha = 0.22;
    this.statusText = new Text({
      text: "",
      style: {
        fontFamily: theme.fonts.sans,
        fontSize: 13,
        fontWeight: "700",
        fill: theme.colors.statusSuccess,
      },
    });
    this.labelText = new Text({
      text: label,
      style: {
        fontFamily: theme.fonts.sans,
        fontSize: 12.5,
        fontWeight: "600",
        fill: theme.colors.ink,
      },
    });
    this.view.addChild(
      this.shadow,
      this.background,
      this.icon,
      this.statusText,
      this.labelText,
    );
    this.view.alpha = 0;
  }

  setState(status: NodeStatus, text: string): void {
    const changed =
      this.statusText.text !== "" &&
      (status !== this.status || text !== this.statusText.text);
    this.status = status;
    this.statusText.text = text;
    this.statusText.style.fill = statusColor(this.theme.colors, status);
    this.layout();
    if (changed) this.pulseElapsed = 0;
  }

  /** Pops the card in; `immediate` skips the animation (reduced motion). */
  show(immediate: boolean): void {
    this.hideElapsed = Number.POSITIVE_INFINITY;
    if (immediate) {
      this.view.alpha = 1;
      this.view.scale.set(1);
      return;
    }
    this.appearElapsed = 0;
  }

  /** Fades the card out. */
  hide(): void {
    this.appearElapsed = Number.POSITIVE_INFINITY;
    this.hideElapsed = 0;
  }

  update(deltaMs: number): void {
    if (this.hideElapsed < HIDE_MS) {
      this.hideElapsed += deltaMs;
      const t = Math.min(1, this.hideElapsed / HIDE_MS);
      this.view.alpha = 1 - t;
      this.view.scale.set(1 - 0.04 * t);
    } else if (this.appearElapsed < APPEAR_MS) {
      this.appearElapsed += deltaMs;
      const t = Math.min(1, this.appearElapsed / APPEAR_MS);
      this.view.alpha = t;
      this.view.scale.set(0.9 + 0.1 * easeOutBack(t));
    } else if (this.pulseElapsed < PULSE_MS) {
      this.pulseElapsed += deltaMs;
      const t = Math.min(1, this.pulseElapsed / PULSE_MS);
      this.view.scale.set(1 + Math.sin(t * Math.PI) * 0.05);
    }

    if (this.status === "processing" || this.status === "retry") {
      this.iconSpin += deltaMs * 0.006;
      this.icon.rotation = this.iconSpin;
    } else if (this.icon.rotation !== 0) {
      this.icon.rotation = 0;
    }
  }

  private layout(): void {
    const firstLineWidth = ICON_RADIUS * 2 + 7 + this.statusText.width;
    const width = Math.ceil(
      PADDING_X * 2 + Math.max(firstLineWidth, this.labelText.width),
    );
    this.size.width = width;
    const color = statusColor(this.theme.colors, this.status);

    this.background
      .clear()
      .roundRect(0, 0, width, HEIGHT, 11)
      .fill(this.theme.colors.surface)
      .stroke({ color: this.theme.colors.line, width: 1 });
    this.shadow.setSize(width * 1.45, HEIGHT * 2.1);
    this.shadow.position.set(
      (width - this.shadow.width) / 2,
      (HEIGHT - this.shadow.height) / 2 + 7,
    );

    this.icon.clear().circle(0, 0, ICON_RADIUS).fill(color);
    drawGlyph(this.icon, this.status);
    this.icon.position.set(
      PADDING_X + ICON_RADIUS,
      PADDING_Y + ICON_RADIUS - 0.5,
    );
    this.statusText.position.set(
      PADDING_X + ICON_RADIUS * 2 + 7,
      PADDING_Y - 1,
    );
    this.labelText.position.set(PADDING_X, PADDING_Y + 19);

    this.view.pivot.set(Math.round(width / 2), HEIGHT);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";

import type { SceneTheme } from "../theme/scene-theme";

const PADDING_X = 10;
const HEIGHT = 30;
const GAP = 6;

/**
 * One-line hover label above a building: "Orders API · FastAPI". Screen space, like the status
 * cards, so the text stays crisp; the pivot is the bottom center.
 */
export class NodeTooltip {
  readonly view = new Container({ label: "node-tooltip" });
  readonly size = { width: 0, height: HEIGHT };
  private readonly shadow: Sprite;
  private readonly background = new Graphics();
  private readonly labelText: Text;
  private readonly techText: Text;
  private readonly separator = new Graphics();

  constructor(
    private readonly theme: SceneTheme,
    shadowTexture: Texture,
  ) {
    this.shadow = new Sprite(shadowTexture);
    this.shadow.alpha = 0.18;
    this.labelText = new Text({
      text: "",
      style: {
        fontFamily: theme.fonts.sans,
        fontSize: 13,
        fontWeight: "700",
        fill: theme.colors.ink,
      },
    });
    this.techText = new Text({
      text: "",
      style: {
        fontFamily: theme.fonts.sans,
        fontSize: 12.5,
        fontWeight: "600",
        fill: theme.colors.ink3,
      },
    });
    this.view.addChild(
      this.shadow,
      this.background,
      this.labelText,
      this.separator,
      this.techText,
    );
    this.view.visible = false;
  }

  setContent(label: string, tech: string): void {
    if (this.labelText.text === label && this.techText.text === tech) return;
    this.labelText.text = label;
    this.techText.text = tech;

    const labelWidth = Math.ceil(this.labelText.width);
    const techWidth = Math.ceil(this.techText.width);
    const width = PADDING_X * 2 + labelWidth + GAP * 2 + 3 + techWidth;
    this.size.width = width;
    this.background
      .clear()
      .roundRect(0, 0, width, HEIGHT, HEIGHT / 2)
      .fill(this.theme.colors.surface)
      .stroke({ color: this.theme.colors.line, width: 1 });
    this.shadow.setSize(width * 1.4, HEIGHT * 2.2);
    this.shadow.position.set(
      (width - this.shadow.width) / 2,
      (HEIGHT - this.shadow.height) / 2 + 6,
    );
    const textY = Math.round((HEIGHT - this.labelText.height) / 2);
    this.labelText.position.set(PADDING_X, textY);
    const separatorX = PADDING_X + labelWidth + GAP + 1.5;
    this.separator
      .clear()
      .circle(separatorX, HEIGHT / 2, 1.5)
      .fill(this.theme.colors.ink3);
    this.techText.position.set(
      separatorX + 1.5 + GAP,
      Math.round((HEIGHT - this.techText.height) / 2),
    );
    this.view.pivot.set(Math.round(width / 2), HEIGHT);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

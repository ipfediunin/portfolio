import { Container, Graphics, Text } from "pixi.js";

import type { SceneTheme } from "../theme/scene-theme";

const PADDING_X = 8;
const HEIGHT = 22;

/**
 * A small permanent name above a building ("RAG API"), for worlds that explain an architecture.
 * Screen space, like the status cards, so the text stays crisp; the pivot is the bottom center.
 */
export class NameTag {
  readonly view = new Container({ label: "name-tag" });
  readonly size: { readonly width: number; readonly height: number };

  constructor(theme: SceneTheme, label: string) {
    const text = new Text({
      text: label,
      style: {
        fontFamily: theme.fonts.sans,
        fontSize: 11.5,
        fontWeight: "700",
        fill: theme.colors.ink,
      },
    });
    const width = Math.ceil(text.width) + PADDING_X * 2;
    const background = new Graphics()
      .roundRect(0, 0, width, HEIGHT, 7)
      .fill({ color: theme.colors.surface, alpha: 0.94 })
      .stroke({ color: theme.colors.line, width: 1 });
    text.position.set(PADDING_X, Math.round((HEIGHT - text.height) / 2));
    this.view.addChild(background, text);
    this.view.pivot.set(Math.round(width / 2), HEIGHT);
    this.size = { width, height: HEIGHT };
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

import { describe, expect, it } from "vitest";

import { normalizeHex, resolveSceneColors } from "./scene-theme";

describe("resolveSceneColors", () => {
  it("uses token values from the stylesheet", () => {
    const colors = resolveSceneColors((name) =>
      name === "--color-flow-sync" ? " #00ff88 " : "#123456",
    );
    expect(colors.flowSync).toBe("#00ff88");
    expect(colors.ground).toBe("#123456");
  });

  it("expands minified three-digit colors", () => {
    expect(resolveSceneColors(() => "#FFF").surface).toBe("#ffffff");
  });

  it("falls back for missing or unsupported values", () => {
    const colors = resolveSceneColors((name) =>
      name === "--color-glass" ? "oklch(60% 0.2 270)" : "",
    );
    expect(colors.glass).toMatch(/^#[0-9a-f]{6}$/);
    expect(colors.ground).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("normalizeHex", () => {
  it("keeps six-digit colors and lowercases them", () => {
    expect(normalizeHex("#A1B2C3")).toBe("#a1b2c3");
    expect(normalizeHex("#0af")).toBe("#00aaff");
  });
});

/** CSS custom properties from src/app/globals.css that the scene uses. */
const colorTokens = {
  ground: "--color-ground",
  road: "--color-road",
  roadMark: "--color-road-mark",
  sidewalk: "--color-sidewalk",
  plate: "--color-plate",
  plateSide: "--color-plate-side",
  grass: "--color-grass",
  line: "--color-line",
  surface: "--color-surface",
  ink: "--color-ink",
  ink2: "--color-ink-2",
  ink3: "--color-ink-3",
  buildingTop: "--color-building-top",
  buildingLeft: "--color-building-left",
  buildingRight: "--color-building-right",
  glass: "--color-glass",
  glassLight: "--color-glass-light",
  glassDim: "--color-glass-dim",
  tree: "--color-tree",
  treeDark: "--color-tree-dark",
  flowSync: "--color-flow-sync",
  flowAsync: "--color-flow-async",
  statusSuccess: "--color-status-success",
  statusProcessing: "--color-status-processing",
  statusQueued: "--color-status-queued",
  statusRetry: "--color-status-retry",
  statusFailed: "--color-status-failed",
  statusCached: "--color-status-cached",
} as const;

export type SceneColors = Readonly<Record<keyof typeof colorTokens, string>>;

export interface SceneTheme {
  readonly colors: SceneColors;
  /** Resolved CSS font stacks (next/font generates the family names). */
  readonly fonts: { readonly sans: string; readonly mono: string };
}

/** Used only if the stylesheet has not provided a token (e.g. it failed to load). */
const fallbackColors: SceneColors = {
  ground: "#eef2f8",
  road: "#e4e9f2",
  roadMark: "#ffffff",
  sidewalk: "#f3f5f9",
  plate: "#f9fafd",
  plateSide: "#dfe5ef",
  grass: "#dceee2",
  line: "#e3e8f1",
  surface: "#ffffff",
  ink: "#0d1530",
  ink2: "#3e4864",
  ink3: "#646e8a",
  buildingTop: "#f1f4fa",
  buildingLeft: "#dce3f0",
  buildingRight: "#c7d1e5",
  glass: "#3d5afe",
  glassLight: "#7b93ff",
  glassDim: "#aab6da",
  tree: "#8ccb9e",
  treeDark: "#5da97a",
  flowSync: "#22b8f0",
  flowAsync: "#8b5cf6",
  statusSuccess: "#10b981",
  statusProcessing: "#3b82f6",
  statusQueued: "#8b5cf6",
  statusRetry: "#f59e0b",
  statusFailed: "#ef4444",
  statusCached: "#06b6d4",
};

const fallbackFonts = {
  sans: "system-ui, sans-serif",
  mono: "ui-monospace, monospace",
};

const hexColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc" → "#aabbcc"; minified CSS shortens colors, the scene's color math needs six digits. */
export function normalizeHex(value: string): string {
  const hex = value.toLowerCase();
  if (hex.length === 7) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

/** Resolves every color through `readToken`, keeping the fallback for missing or non-hex values. */
export function resolveSceneColors(
  readToken: (cssVariable: string) => string,
): SceneColors {
  const colors: Record<keyof SceneColors, string> = { ...fallbackColors };
  for (const key of Object.keys(colorTokens) as (keyof SceneColors)[]) {
    const value = readToken(colorTokens[key]).trim();
    if (hexColorPattern.test(value)) colors[key] = normalizeHex(value);
  }
  return colors;
}

export function readSceneTheme(
  element: Element = document.documentElement,
): SceneTheme {
  const style = getComputedStyle(element);
  return {
    colors: resolveSceneColors((cssVariable) =>
      style.getPropertyValue(cssVariable),
    ),
    fonts: {
      sans: style.getPropertyValue("--font-sans").trim() || fallbackFonts.sans,
      mono: style.getPropertyValue("--font-mono").trim() || fallbackFonts.mono,
    },
  };
}

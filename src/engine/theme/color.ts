/** Small color math on "#rrggbb" strings for build-time shading of procedural art. */

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex(red: number, green: number, blue: number): string {
  const clamp = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel)));
  return `#${((1 << 24) | (clamp(red) << 16) | (clamp(green) << 8) | clamp(blue)).toString(16).slice(1)}`;
}

/** Linear blend: t = 0 → a, t = 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Multiplies every channel: factor < 1 darkens, > 1 lightens. */
export function shadeHex(hex: string, factor: number): string {
  const [red, green, blue] = channels(hex);
  return toHex(red * factor, green * factor, blue * factor);
}

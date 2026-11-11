import { prefersReducedMotion } from "@/features/stage/browser-support";

/** Share of the scene that must be on screen after a send; less than that scrolls it into view. */
const SCENE_VISIBLE_SHARE = 0.6;

/** Brings the scene into view after the visitor started something far below it (phones). */
export function revealScene(scene: HTMLElement | null): void {
  if (!scene) return;
  const rect = scene.getBoundingClientRect();
  const visible =
    Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  if (visible >= rect.height * SCENE_VISIBLE_SHARE) return;
  scene.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}

/** Cheap WebGL probe before downloading the engine chunk; the probe context is released right away. */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch (error) {
    console.warn("[stage] WebGL probe failed", error);
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Runs `callback` when the main thread is idle (or soon, where requestIdleCallback is missing). */
export function scheduleIdle(
  callback: () => void,
  timeoutMs = 1500,
): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 200);
  return () => window.clearTimeout(handle);
}

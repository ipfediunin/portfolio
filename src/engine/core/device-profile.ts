import type { DeviceProfile } from "./quality";

/** Non-standard hints that exist only in some browsers, so they are optional. */
interface NavigatorHints {
  readonly deviceMemory?: number;
  readonly connection?: { readonly saveData?: boolean };
}

export function readDeviceProfile(): DeviceProfile {
  const hints = navigator as Navigator & NavigatorHints;

  return {
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency || undefined,
    deviceMemoryGb: hints.deviceMemory,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    saveData: hints.connection?.saveData ?? false,
  };
}

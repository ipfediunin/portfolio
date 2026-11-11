export type QualityTierName = "high" | "medium" | "low";

export interface QualityTier {
  readonly name: QualityTierName;
  /** Cap for the canvas resolution: rendering at DPR 3–4 costs far more than it shows. */
  readonly maxResolution: number;
  readonly maxFps: number;
  /** Fixed at context creation; a runtime downgrade keeps the initial value. */
  readonly antialias: boolean;
}

export const qualityTiers: Readonly<Record<QualityTierName, QualityTier>> = {
  high: { name: "high", maxResolution: 2, maxFps: 60, antialias: true },
  medium: { name: "medium", maxResolution: 1.5, maxFps: 60, antialias: true },
  low: { name: "low", maxResolution: 1, maxFps: 30, antialias: false },
};

export interface DeviceProfile {
  readonly devicePixelRatio: number;
  readonly hardwareConcurrency: number | undefined;
  /** navigator.deviceMemory: approximate RAM in GB, capped at 8 by browsers; missing outside Chromium. */
  readonly deviceMemoryGb: number | undefined;
  readonly coarsePointer: boolean;
  readonly saveData: boolean;
}

/** Initial tier from device hints; the frame monitor refines it with real frame times. */
export function detectQualityTier(profile: DeviceProfile): QualityTierName {
  const cores = profile.hardwareConcurrency ?? 4;
  const memory = profile.deviceMemoryGb ?? 4;

  if (profile.saveData || cores <= 2 || memory <= 2) return "low";
  if (profile.coarsePointer || cores <= 4 || memory <= 4) return "medium";
  return "high";
}

export function downgradeTier(name: QualityTierName): QualityTierName {
  return name === "high" ? "medium" : "low";
}

export function resolveResolution(
  tier: QualityTier,
  devicePixelRatio: number,
): number {
  return Math.max(1, Math.min(devicePixelRatio, tier.maxResolution));
}

/** Frame time above which a tier counts as too heavy for the device (30% headroom over the target). */
export function frameBudgetMs(tier: QualityTier): number {
  return (1000 / tier.maxFps) * 1.3;
}

type ClassValue = string | false | null | undefined;

/** Joins truthy class names. Variants are designed not to conflict, so no merge step is needed. */
export function cn(...classes: readonly ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

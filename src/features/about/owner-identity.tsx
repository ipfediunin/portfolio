import { siteConfig } from "@/content/site";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { cn } from "@/lib/cn";

interface OwnerIdentityProps {
  /** `about.age` and `about.entrepreneur` from the dictionary. */
  readonly copy: Pick<Dictionary["about"], "age" | "entrepreneur">;
  readonly className?: string;
}

/**
 * The owner's name, age and how they work (an individual entrepreneurship registered in Armenia,
 * which is what the site name stands for). Renders nothing until NEXT_PUBLIC_OWNER_NAME is set.
 */
export function OwnerIdentity({ copy, className }: OwnerIdentityProps) {
  const { ownerName, ownerAge } = siteConfig;
  if (!ownerName) return null;
  return (
    <div className={cn("border-l-2 border-brand pl-4", className)}>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xl font-bold tracking-[-0.01em] text-ink">
          {ownerName}
        </span>
        {ownerAge ? (
          <span className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
            {copy.age.replace("{age}", String(ownerAge))}
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-ink-2">{copy.entrepreneur}</p>
    </div>
  );
}

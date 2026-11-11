import Image from "next/image";

import { cn } from "@/lib/cn";

interface OwnerPortraitProps {
  /** A file in /public (NEXT_PUBLIC_OWNER_PHOTO), or null while there is no portrait yet. */
  readonly photo: string | null;
  readonly alt: string;
  /** Development builds only: the text in the empty slot. */
  readonly slotLabel: string;
  readonly className?: string;
}

const frameClass =
  "relative aspect-[3/4] w-full max-w-[18rem] overflow-hidden rounded-3xl sm:max-w-[22rem]";

/**
 * The owner's portrait on the About page. Without a photo production renders nothing (no
 * placeholder people would see), while development builds outline the slot so the layout can be
 * checked before the photo exists.
 */
export function OwnerPortrait({
  photo,
  alt,
  slotLabel,
  className,
}: OwnerPortraitProps) {
  if (photo) {
    return (
      <figure
        className={cn(
          frameClass,
          // A cut-out portrait (transparent background) stands on the site's light ground with a
          // soft brand glow, like the hero; an opaque photo simply covers it.
          "border border-line bg-[radial-gradient(90%_60%_at_50%_100%,rgb(79_70_229/0.16),transparent_70%),linear-gradient(180deg,var(--color-plate),var(--color-ground))] shadow-card",
          className,
        )}
      >
        <Image
          src={photo}
          alt={alt}
          fill
          sizes="(min-width: 640px) 352px, 288px"
          // Above the fold on desktop: the likely LCP element of the page.
          loading="eager"
          fetchPriority="high"
          className="object-cover"
        />
      </figure>
    );
  }
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <div
      className={cn(
        frameClass,
        "grid place-items-center border-2 border-dashed border-line bg-surface p-8 text-center font-mono text-xs leading-relaxed text-ink-3",
        className,
      )}
    >
      {slotLabel}
    </div>
  );
}

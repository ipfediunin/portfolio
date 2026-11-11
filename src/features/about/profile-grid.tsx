import type { Dictionary } from "@/i18n/dictionaries/en";

interface ProfileGridProps {
  readonly groups: Dictionary["about"]["profile"];
}

/** The confirmed technical profile, grouped (Backend, Frontend, AI / Data…), as tag lists. */
export function ProfileGrid({ groups }: ProfileGridProps) {
  return (
    <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {groups.map((group) => (
        <li
          key={group.title}
          className="rounded-2xl border border-line bg-surface p-5"
        >
          <h3 className="font-bold text-ink">{group.title}</h3>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {group.items.map((item) => (
              <li
                key={item}
                className="rounded-full border border-line bg-bg px-2.5 py-1 text-xs font-medium text-ink-2"
              >
                {item}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

import { hirePage } from "@/content/hire";
import { workProcess } from "@/content/services";

interface WorkProcessProps {
  /** Id of the section heading, for aria-labelledby. */
  readonly headingId: string;
}

/** Discovery → Solution design → Development → Validation → Delivery. */
export function WorkProcess({ headingId }: WorkProcessProps) {
  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl"
      >
        {hirePage.processTitle}
      </h2>
      <p className="mt-3 max-w-3xl text-lg text-ink-2">
        {hirePage.processLead}
      </p>
      <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
        {workProcess.map((step, index) => (
          <li key={step.title} className="bg-surface p-6">
            <span className="font-mono text-sm text-brand">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-lg font-bold text-ink">{step.title}</h3>
            <p className="mt-2 text-ink-2">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

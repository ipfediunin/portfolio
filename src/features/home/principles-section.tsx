import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/typography";
import type { Dictionary } from "@/i18n/dictionaries/en";

export function PrinciplesSection({
  content,
}: {
  readonly content: Dictionary["home"]["principles"];
}) {
  return (
    <section className="py-20 lg:py-28">
      <Container>
        <SectionHeading eyebrow={content.eyebrow} title={content.title} />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {content.items.map((item, index) => (
            <li key={item.title} className="bg-surface p-7">
              <span className="font-mono text-sm text-brand">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-xl font-bold tracking-[-0.015em] text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-ink-2">{item.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

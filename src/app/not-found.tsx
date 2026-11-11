import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { getDictionary, getLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/paths";

export default async function NotFound() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);

  return (
    <Container className="flex flex-col items-start py-24 lg:py-32">
      <p className="rounded-lg border border-status-failed/30 bg-status-failed/5 px-3 py-1.5 font-mono text-sm text-status-failed">
        HTTP 404 · Not Found
      </p>
      <h1 className="mt-6 text-4xl font-bold tracking-[-0.025em] text-ink sm:text-5xl">
        {dictionary.notFound.title}
      </h1>
      <p className="mt-4 max-w-xl text-lg text-ink-2">
        {dictionary.notFound.text}
      </p>
      <ButtonLink href={localizePath(locale, "/")} size="lg" className="mt-9">
        {dictionary.notFound.home}
      </ButtonLink>
    </Container>
  );
}

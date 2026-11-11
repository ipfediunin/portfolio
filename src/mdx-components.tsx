import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentProps } from "react";

/** Typography of case studies: the same rhythm as the rest of the site, no prose plugin needed. */
const components = {
  h2: ({ children }) => (
    <h2 className="mt-14 text-2xl font-bold tracking-[-0.02em] text-ink first:mt-0 sm:text-3xl">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 text-lg font-bold tracking-[-0.01em] text-ink">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mt-4 text-lg leading-relaxed text-ink-2">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mt-4 space-y-2.5 text-lg leading-relaxed text-ink-2">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2.5 pl-6 text-lg leading-relaxed text-ink-2 marker:font-mono marker:text-ink-3">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="relative pl-5 before:absolute before:top-[0.7em] before:left-0 before:size-1.5 before:rounded-full before:bg-brand [ol_&]:pl-1 [ol_&]:before:hidden">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  code: ({ children }) => (
    <code className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-ink">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mt-6 overflow-x-auto rounded-2xl bg-ink p-4 font-mono text-[13px] leading-relaxed text-white/85 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-6 border-l-2 border-brand pl-5 text-ink [&_p]:text-ink">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: ComponentProps<"a">) =>
    href?.startsWith("/") ? (
      <Link
        href={href}
        className="font-medium text-brand underline-offset-4 hover:underline"
      >
        {children}
      </Link>
    ) : (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand underline-offset-4 hover:underline"
      >
        {children}
      </a>
    ),
} satisfies MDXComponents;

export function useMDXComponents(): MDXComponents {
  return components;
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A page section.
 *
 * `surface` is what gives the page its dark/light rhythm; every colour token inside
 * rebinds to it, so children never need to know which section they are in.
 *
 * The numbered marker is part of the editorial language: sections are counted, like
 * plates in a magazine, rather than floating as anonymous bands.
 */

export type Surface = "dark" | "ivory" | "lime";

interface SectionProps {
  children: ReactNode;
  surface?: Surface;
  /** Two-digit marker, e.g. "03". Rendered decoratively and hidden from AT. */
  index?: string;
  eyebrow?: string;
  id?: string;
  className?: string;
  /** Accessible name for the section landmark, when the visible heading is not enough. */
  ariaLabel?: string;
  /** Vertical rhythm. "tight" for utility bands, "loose" for editorial moments. */
  spacing?: "tight" | "normal" | "loose";
}

const spacingClasses = {
  tight: "py-12 sm:py-16",
  normal: "py-16 sm:py-24 lg:py-32",
  loose: "py-24 sm:py-32 lg:py-44",
} as const;

export function Section({
  children,
  surface = "dark",
  index,
  eyebrow,
  id,
  className,
  ariaLabel,
  spacing = "normal",
}: SectionProps) {
  return (
    <section
      id={id}
      data-surface={surface}
      aria-label={ariaLabel}
      className={cn("surface relative", spacingClasses[spacing], className)}
    >
      {(index || eyebrow) && (
        <div className="shell mb-10 flex items-baseline gap-4 sm:mb-14">
          {index && (
            <span
              aria-hidden="true"
              className="font-display text-eyebrow shrink-0 border border-[var(--surface-line)] px-2 py-1 tabular-nums"
            >
              {index}
            </span>
          )}
          {eyebrow && (
            <p className="text-eyebrow font-display text-[var(--surface-muted)] uppercase">
              {eyebrow}
            </p>
          )}
          <span aria-hidden="true" className="rule mt-auto mb-2 hidden h-px flex-1 border-t sm:block" />
        </div>
      )}
      {children}
    </section>
  );
}

/** Section heading. Oversized by default; line breaks are the author's choice. */
export function SectionHeading({
  children,
  className,
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return <Tag className={cn("text-display", className)}>{children}</Tag>;
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-lead max-w-prose text-[var(--surface-muted)]", className)}>{children}</p>
  );
}

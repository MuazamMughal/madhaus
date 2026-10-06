import type { ReactNode } from "react";
import type { Surface } from "./section";

/**
 * Header for an inner page.
 *
 * Quieter than the homepage hero -- it introduces rather than performs -- but keeps the
 * same oversized display type so the pages read as one site.
 */
export function PageHero({
  eyebrow,
  title,
  accent,
  lead,
  surface = "dark",
  children,
  artwork,
}: {
  eyebrow?: string;
  title: string;
  /** Trailing words that take the accent colour. */
  accent?: string;
  lead?: string;
  surface?: Surface;
  children?: ReactNode;
  artwork?: ReactNode;
}) {
  return (
    <section data-surface={surface} className="surface border-b border-[var(--surface-line)]">
      <div className={`shell py-16 sm:py-24 ${artwork ? "grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8" : ""}`}>
        <div>
        {eyebrow && (
          <p className="text-eyebrow font-display mb-5 flex items-center gap-3 text-[var(--surface-accent)] uppercase">
            <span aria-hidden="true" className="inline-block h-px w-10 bg-[var(--surface-accent)]" />
            {eyebrow}
          </p>
        )}
        <h1 className="text-display max-w-[18ch]">
          {title}
          {accent && (
            <>
              {" "}
              <span className="text-[var(--surface-accent)]">{accent}</span>
            </>
          )}
        </h1>
        {lead && <p className="text-lead mt-6 max-w-2xl text-[var(--surface-muted)]">{lead}</p>}
        {children && <div className="mt-10">{children}</div>}
        </div>
        {artwork}
      </div>
    </section>
  );
}

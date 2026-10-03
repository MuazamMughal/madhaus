import type { ReactNode } from "react";
import { PageHero } from "./page-hero";
import { Section } from "./section";

/**
 * Shell for the legal pages.
 *
 * Every one of these carries a visible "needs business review" notice while the content
 * is the shipped draft. These documents create obligations for a real business, and a
 * plausible-looking draft that nobody has checked is worse than an obviously unfinished
 * one.
 */
export function PolicyPage({
  title,
  lead,
  needsReview = true,
  updated,
  children,
}: {
  title: string;
  lead?: string;
  needsReview?: boolean;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero eyebrow="Policies" title={title} lead={lead} />

      <Section surface="dark" spacing="tight">
        <div className="shell shell-content">
          {needsReview && (
            <div
              role="note"
              className="mb-12 border-l-4 border-pending bg-charcoal-raised p-5"
            >
              <p className="font-display text-sm text-pending uppercase">Draft — needs review</p>
              <p className="mt-2 text-sm text-grey-200">
                This is a starting draft, not legal advice, and it has not been reviewed by the
                venue or by a lawyer. It must be checked against how the business actually
                operates, and against Pakistani consumer and data protection law, before the site
                goes live.
              </p>
            </div>
          )}

          {updated && (
            <p className="text-eyebrow font-display mb-8 text-grey-400 uppercase">
              Last updated {updated}
            </p>
          )}

          <div className="policy-body space-y-8">{children}</div>
        </div>
      </Section>
    </>
  );
}

/** A section within a policy. */
export function PolicySection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-title font-display mb-4">{heading}</h2>
      <div className="space-y-4 text-grey-200 [&_a]:underline [&_a]:decoration-lime [&_a]:decoration-2 [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}

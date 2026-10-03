import Link from "next/link";
import { MediaPanel } from "@/components/ui/media-panel";
import { Reveal } from "@/components/ui/reveal";
import type { SportSummary } from "@/lib/content/types";

/**
 * "Choose your game".
 *
 * Three visually distinct introductions rather than three identical cards: the first is
 * given more room, and each carries its own motif. The shared-court note is on the card,
 * not in a footnote, because it changes what a customer can book.
 */
export function SportCards({ sports }: { sports: SportSummary[] }) {
  const motifs = { padel: "padel", cricket: "pitch", football: "pitch" } as const;

  return (
    <div className="shell grid gap-px bg-[var(--surface-line)] sm:grid-cols-2 lg:grid-cols-3">
      {sports.map((sport, index) => (
        <Reveal
          key={sport.slug}
          delay={Math.min(index, 3) as 0 | 1 | 2 | 3}
          className={
            // The first card spans two columns on tablet, so the grid is not a bland 2x2.
            index === 0 ? "sm:col-span-2 lg:col-span-1" : ""
          }
        >
          <Link
            href={`/arena/${sport.slug}`}
            className="group surface flex h-full flex-col focus-visible:outline-offset-[-3px]"
          >
            <div className="relative overflow-hidden">
              <MediaPanel
                image={sport.image}
                aspect={index === 0 ? "wide" : "landscape"}
                motif={motifs[sport.slug as keyof typeof motifs] ?? "padel"}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                placeholderLabel={`${sport.name} — the court in play`}
                // A slow, small zoom. Enough to feel alive, not enough to distract.
                className="transition-transform duration-700 ease-[var(--ease-out-quint)] group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none"
              />
            </div>

            <div className="flex flex-1 flex-col p-6 sm:p-8">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-headline">{sport.name}</h3>
                {sport.fromPriceLabel && (
                  <p className="text-eyebrow font-display shrink-0 text-[var(--surface-muted)] uppercase" data-numeric="">
                    {sport.fromPriceLabel}
                  </p>
                )}
              </div>

              <p className="mt-4 text-sm text-[var(--surface-muted)]">{sport.blurb}</p>

              {sport.courtNote && (
                <p className="mt-4 border-l-2 border-[var(--surface-accent)] pl-3 text-xs text-[var(--surface-muted)]">
                  {sport.courtNote}
                </p>
              )}

              <p className="font-display mt-auto pt-8 text-sm uppercase">
                <span className="underline decoration-2 decoration-[var(--surface-accent)] underline-offset-4 transition group-hover:decoration-[var(--surface-fg)]">
                  See {sport.name}
                </span>
                <span aria-hidden="true" className="ml-2 inline-block transition-transform group-hover:translate-x-1">
                  →
                </span>
              </p>
            </div>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}

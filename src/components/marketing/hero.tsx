import { ButtonLink } from "@/components/ui/button";
import { HeroImages } from "./hero-images";
import type { HeroContent } from "@/lib/content/types";

/** Homepage headline over the sport slideshow, with a readable dark scrim. */
export function Hero({ content, hoursLabel }: { content: HeroContent; hoursLabel: string | null }) {
  const lines = content.headlineLines ?? [content.headline];

  return (
    <section
      data-surface="dark"
      // Pulled up by exactly the header's height so the media runs edge to edge behind
      // it, while the header still takes its space for every other page.
      className="surface relative isolate -mt-18 overflow-hidden sm:-mt-20"
    >
      <HeroImages image={content.image} />

      <div className="shell flex min-h-[86svh] flex-col justify-end pt-36 pb-14 sm:min-h-[92svh] sm:pb-20">
        <p className="text-eyebrow font-display mb-6 flex items-center gap-3 text-lime uppercase">
          <span aria-hidden="true" className="inline-block h-px w-10 bg-lime" />
          {content.locationLabel}
        </p>

        <h1 className="text-hero max-w-[16ch] font-extrabold" style={{ fontStretch: "76%" }}>
          {lines.map((line, index) => (
            <span key={line} className="block">
              {/* The last line carries the accent, so the eye lands on the payoff. */}
              {index === lines.length - 1 ? <span className="text-lime">{line}</span> : line}
            </span>
          ))}
        </h1>

        <p className="text-lead mt-8 max-w-xl text-grey-200">{content.subhead}</p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ButtonLink href={content.primaryCta.href} size="lg">
            {content.primaryCta.label}
          </ButtonLink>
          <ButtonLink href={content.secondaryCta.href} size="lg" variant="secondary">
            {content.secondaryCta.label}
          </ButtonLink>
        </div>

        {hoursLabel && (
          <p className="text-eyebrow font-display mt-10 text-grey-400 uppercase" data-numeric="">
            Open {hoursLabel}
          </p>
        )}
      </div>
    </section>
  );
}

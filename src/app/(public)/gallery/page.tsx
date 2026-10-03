import type { Metadata } from "next";
import { MediaPanel } from "@/components/ui/media-panel";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { Section } from "@/components/ui/section";
import { SocialLinks } from "@/components/ui/social-links";
import { getFeatureFlags } from "@/server/public-queries";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Gallery",
  description: "The courts, the food and the crowd at MadHaus in Sahiwal.",
  alternates: { canonical: "/gallery" },
};

/**
 * /gallery
 *
 * Brand-owned imagery only. Social embeds stay behind a flag and are off: they would load
 * third-party JavaScript on first paint, and a page that scrapes a social network at
 * request time breaks the moment that network changes.
 */
export default async function GalleryPage() {
  const [settings, flags] = await Promise.all([getSiteSettings(), getFeatureFlags()]);

  const hasSocial = Boolean(
    settings.social.instagram || settings.social.facebook || settings.social.tiktok,
  );

  // A composition rather than a uniform grid: sizes and motifs alternate so the page has
  // rhythm even before real photography lands.
  const tiles = [
    { motif: "padel", aspect: "landscape", span: "sm:col-span-2", label: "padel rally under lights" },
    { motif: "cafe", aspect: "portrait", span: "", label: "coffee on the pass" },
    { motif: "crowd", aspect: "portrait", span: "", label: "the crowd courtside" },
    { motif: "pitch", aspect: "landscape", span: "sm:col-span-2", label: "cricket on the shared court" },
    { motif: "cafe", aspect: "square", span: "", label: "food close-up" },
    { motif: "padel", aspect: "square", span: "", label: "racket detail" },
  ] as const;

  return (
    <>
      <PageHero
        eyebrow="Gallery"
        title="On any"
        accent="given night."
        lead="The courts, the food, and everyone who turns up."
      />

      <Section surface="dark" spacing="tight">
        <div className="shell">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {tiles.map((tile, index) => (
              <Reveal key={index} delay={(index % 4) as 0 | 1 | 2 | 3} className={tile.span}>
                <MediaPanel
                  image={null}
                  aspect={tile.aspect}
                  motif={tile.motif}
                  sizes="(max-width: 640px) 100vw, 33vw"
                  placeholderLabel={`gallery — ${tile.label}`}
                />
              </Reveal>
            ))}
          </div>

          <div className="mt-14 border-t border-charcoal-line pt-10">
            <p className="max-w-2xl text-sm text-grey-300">
              Photography of the venue has not been supplied yet, so these panels are placeholders.
              {hasSocial && " In the meantime there is plenty on the venue's own channels:"}
            </p>
            <SocialLinks settings={settings} variant="buttons" className="mt-5" />
            {flags["gallery.socialEmbeds"] !== true && (
              <p className="mt-6 text-xs text-grey-400">
                Social feeds are linked rather than embedded, so the page stays fast and does not
                depend on another site being up.
              </p>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}

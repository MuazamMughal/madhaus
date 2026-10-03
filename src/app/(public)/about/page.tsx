import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { MediaPanel } from "@/components/ui/media-panel";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { Lead, Section, SectionHeading } from "@/components/ui/section";
import { SAMPLE_AMENITIES } from "@/lib/content/sample";
import { getHoursLabel } from "@/server/public-queries";
import { getFaqs, getSiteSettings } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: "About",
    description: `${settings.brandName} is a sports arena and café in ${settings.city}, Pakistan — padel, cricket and a kitchen open late.`,
    alternates: { canonical: "/about" },
  };
}

/**
 * /about
 *
 * Kept short on purpose. The venue has not supplied a founding story, so this says what
 * is verifiably true and stops, rather than filling the page with invented history.
 */
export default async function AboutPage() {
  const [settings, hoursLabel, faqs] = await Promise.all([
    getSiteSettings(),
    getHoursLabel(),
    getFaqs(),
  ]);

  return (
    <>
      <PageHero
        eyebrow="About"
        title="Play hard."
        accent="Hang out longer."
        lead={settings.tagline ? `${settings.tagline}.` : undefined}
      />

      <Section surface="dark" index="01" eyebrow="The place">
        <div className="shell grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <Reveal>
            <SectionHeading className="max-w-[16ch]">
              A night out
              <br />
              <span className="text-lime">with a game in it.</span>
            </SectionHeading>
            <Lead className="mt-6">
              {settings.brandName} is a sports arena and café in {settings.city}. It has the
              city&apos;s first padel court, a floodlit multipurpose court for cricket, and a
              kitchen that keeps going{hoursLabel ? ` — the whole place runs ${hoursLabel}` : ""}.
            </Lead>
            <p className="mt-6 text-grey-300">
              The idea is simple enough: somewhere you can book a court on the way home, play for
              an hour, and then not have to go anywhere else for food.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <ButtonLink href="/book" size="lg">
                Book a court
              </ButtonLink>
              <ButtonLink href="/menu" size="lg" variant="secondary">
                See the menu
              </ButtonLink>
            </div>
          </Reveal>

          <Reveal delay={1} className="grid grid-cols-2 gap-4">
            <MediaPanel
              image={null}
              aspect="portrait"
              motif="padel"
              sizes="(max-width: 1024px) 50vw, 28vw"
              placeholderLabel="about — the padel court"
            />
            <MediaPanel
              image={null}
              aspect="portrait"
              motif="cafe"
              className="mt-12"
              sizes="(max-width: 1024px) 50vw, 28vw"
              placeholderLabel="about — the café at night"
            />
          </Reveal>
        </div>
      </Section>

      <Section surface="lime" index="02" eyebrow="What's here">
        <div className="shell">
          <dl className="grid gap-px bg-charcoal sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLE_AMENITIES.map((amenity) => (
              <div key={amenity.label} className="surface p-6">
                <dt className="font-display text-title">{amenity.label}</dt>
                {amenity.description && (
                  <dd className="mt-2 text-sm text-[var(--surface-muted)]">{amenity.description}</dd>
                )}
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm text-[var(--surface-muted)]">
            The full facility list is being confirmed with the venue.
          </p>
        </div>
      </Section>

      <Section surface="dark" index="03" eyebrow="Questions">
        <div className="shell shell-content">
          <SectionHeading className="mb-10 max-w-[16ch]">
            Before you <span className="text-lime">book.</span>
          </SectionHeading>
          <dl className="divide-y divide-charcoal-line border-y border-charcoal-line">
            {faqs.map((faq) => (
              <div key={faq.question} className="py-6">
                <dt className="text-title font-display">{faq.question}</dt>
                <dd className="mt-3 text-grey-300">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>
    </>
  );
}

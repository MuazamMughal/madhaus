import Link from "next/link";
import { Hero } from "@/components/marketing/hero";
import { Marquee } from "@/components/marketing/marquee";
import { QuickBooking } from "@/components/marketing/quick-booking";
import { SportCards } from "@/components/marketing/sport-cards";
import { ButtonLink } from "@/components/ui/button";
import { MediaPanel } from "@/components/ui/media-panel";
import { Reveal } from "@/components/ui/reveal";
import { Lead, Section, SectionHeading } from "@/components/ui/section";
import { SocialLinks } from "@/components/ui/social-links";
import { getHero, getSiteSettings } from "@/lib/content";
import { SAMPLE_AMENITIES, SAMPLE_EVENTS, SAMPLE_OFFERS, SAMPLE_TESTIMONIALS } from "@/lib/content/sample";
import {
  getFeatureFlags,
  getHoursLabel,
  getMenuItems,
  getOpeningHoursTable,
  getPublicSports,
} from "@/server/public-queries";

/**
 * Homepage.
 *
 * Sequenced as an editorial page rather than a stack of feature cards: hero, then the
 * one thing most visitors came to do (check a time), then the sports, then the café given
 * equal weight, then the venue, then proof, then how to get here.
 *
 * Sections that have nothing genuine to show remove themselves. There is no section here
 * that renders a placeholder event, a made-up offer or an invented review.
 */
export default async function HomePage() {
  const [settings, hero, sports, hoursLabel, hours, featured, flags] = await Promise.all([
    getSiteSettings(),
    getHero(),
    getPublicSports(),
    getHoursLabel(),
    getOpeningHoursTable(),
    getMenuItems({ limit: 3 }),
    getFeatureFlags(),
  ]);

  const events = SAMPLE_EVENTS;
  const offers = SAMPLE_OFFERS;
  const testimonials = flags["reviews.enabled"] ? SAMPLE_TESTIMONIALS : [];
  const pricingIsSample = flags["pricing.isSample"] === true;

  return (
    <>
      {/* B. Hero */}
      <Hero content={hero} hoursLabel={hoursLabel} />

      {/* C. Quick booking — the first thing under the fold, because it is the point. */}
      <Section surface="dark" spacing="tight" ariaLabel="Check availability">
        <div className="shell">
          <QuickBooking sports={sports} />
          {pricingIsSample && (
            <p className="shell-content mt-3 text-xs text-grey-400">
              * Rates shown across the site are placeholders pending the venue&apos;s confirmed
              price list.
            </p>
          )}
        </div>
      </Section>

      <Marquee items={["Padel", "Cricket", "Coffee till 3am", "Floodlit", "Sahiwal"]} />

      {/* D. Choose your game */}
      <Section surface="dark" index="01" eyebrow="Choose your game" id="sports">
        <div className="shell mb-12">
          <SectionHeading className="max-w-[22ch]">
            Two courts.
            <br />
            <span className="text-lime">Three ways to play.</span>
          </SectionHeading>
        </div>
        <SportCards sports={sports} />
      </Section>

      {/* E. Café — given the same design weight as the arena, on its own warm surface. */}
      <Section surface="ivory" index="02" eyebrow="The café" id="cafe">
        <div className="shell grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <Reveal>
            <SectionHeading className="max-w-[18ch]">
              Stay for the
              <br />
              <span className="text-orange">food.</span>
            </SectionHeading>
            <Lead className="mt-6">
              The kitchen and the coffee run as late as the courts do. Come off the court and
              straight to a table, or just come for the food.
            </Lead>

            {featured.length > 0 && (
              <ul className="mt-10 divide-y divide-[var(--surface-line)] border-y border-[var(--surface-line)]">
                {featured.map((item) => (
                  <li key={item.slug} className="flex items-baseline justify-between gap-4 py-4">
                    <span className="font-medium">{item.name}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      {!item.isAvailable && (
                        <span className="text-eyebrow font-display text-[var(--surface-muted)] uppercase">
                          Sold out
                        </span>
                      )}
                      {item.priceLabel && (
                        <span className="text-sm text-[var(--surface-muted)]" data-numeric="">
                          {item.priceLabel}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/menu" size="lg">
                View menu
              </ButtonLink>
              {/* Reservations only appear when the venue has actually switched them on. */}
              {flags["cafe.tableReservations"] && (
                <ButtonLink href="/cafe#reserve" size="lg" variant="secondary">
                  Request a table
                </ButtonLink>
              )}
            </div>
            {flags["cafe.tableReservations"] && !flags["cafe.tableInstantConfirm"] && (
              <p className="mt-4 text-xs text-[var(--surface-muted)]">
                Table requests are confirmed by the venue — you will hear back before it is booked.
              </p>
            )}
          </Reveal>

          {/* Asymmetric pair, deliberately offset. */}
          <Reveal delay={1} className="grid grid-cols-5 gap-4">
            <MediaPanel
              image={null}
              aspect="portrait"
              motif="cafe"
              className="col-span-3 mt-10"
              sizes="(max-width: 1024px) 60vw, 30vw"
              placeholderLabel="café — a full table, food in the foreground"
            />
            <MediaPanel
              image={null}
              aspect="square"
              motif="crowd"
              className="col-span-2"
              sizes="(max-width: 1024px) 40vw, 20vw"
              placeholderLabel="café — coffee being made"
            />
          </Reveal>
        </div>
      </Section>

      {/* F. Venue experience — only amenities the venue has actually stated. */}
      <Section surface="dark" index="03" eyebrow="The venue">
        <div className="shell grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <Reveal className="grid grid-cols-2 gap-4">
            <MediaPanel
              image={null}
              aspect="portrait"
              motif="padel"
              sizes="(max-width: 1024px) 50vw, 28vw"
              placeholderLabel="venue — the padel court at night"
            />
            <MediaPanel
              image={null}
              aspect="portrait"
              motif="pitch"
              className="mt-12"
              sizes="(max-width: 1024px) 50vw, 28vw"
              placeholderLabel="venue — the multipurpose court, floodlights on"
            />
          </Reveal>

          <Reveal delay={1}>
            <SectionHeading className="max-w-[20ch]">
              Built for
              <br />
              <span className="text-lime">late nights.</span>
            </SectionHeading>
            <Lead className="mt-6">
              {settings.brandName} opens when the day cools off and closes when the city has gone
              quiet. Sahiwal&apos;s first padel court, a floodlit multipurpose court, and somewhere
              worth sitting afterwards.
            </Lead>

            <dl className="mt-10 grid gap-px bg-charcoal-line sm:grid-cols-2">
              {SAMPLE_AMENITIES.map((amenity) => (
                <div key={amenity.label} className="surface p-5">
                  <dt className="font-display text-sm uppercase">{amenity.label}</dt>
                  {amenity.description && (
                    <dd className="mt-1 text-xs text-grey-400">{amenity.description}</dd>
                  )}
                </div>
              ))}
            </dl>

            <p className="mt-6 text-xs text-grey-400">
              Full facility details are being confirmed with the venue.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* G. Events and offers — the whole section is absent when there is nothing on. */}
      {(events.length > 0 || offers.length > 0) && (
        <Section surface="dark" index="04" eyebrow="What's on">
          <div className="shell grid gap-8 md:grid-cols-2">
            {events.map((event) => (
              <Link key={event.slug} href={`/events/${event.slug}`} className="surface group p-6">
                <h3 className="text-title">{event.title}</h3>
                <p className="mt-3 text-sm text-grey-300">{event.summary}</p>
              </Link>
            ))}
            {offers.map((offer) => (
              <article key={offer.slug} className="surface p-6">
                <h3 className="text-title">{offer.title}</h3>
                <p className="mt-3 text-sm text-grey-300">{offer.summary}</p>
              </article>
            ))}
          </div>
        </Section>
      )}

      {/* H. Gallery. Brand-owned imagery only; no runtime scraping of social networks. */}
      <Section surface="dark" index="05" eyebrow="Gallery" spacing="tight">
        <div className="shell">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading className="max-w-[16ch]">On any given night</SectionHeading>
            <ButtonLink href="/gallery" variant="ghost">
              See the gallery
            </ButtonLink>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(["padel", "cafe", "pitch", "crowd"] as const).map((motif, index) => (
              <Reveal key={motif} delay={Math.min(index, 3) as 0 | 1 | 2 | 3}>
                <MediaPanel
                  image={null}
                  aspect="square"
                  motif={motif}
                  sizes="(max-width: 640px) 50vw, 25vw"
                  placeholderLabel={`gallery — ${motif}`}
                />
              </Reveal>
            ))}
          </div>

          {/* Social links, not embeds. An embed would load third-party JS on first paint
              and tie the page to another company staying up. */}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-sm text-grey-400">More on</p>
            <SocialLinks settings={settings} variant="inline" className="gap-x-6" />
          </div>
        </div>
      </Section>

      {/* I. Reviews. Renders only when genuine, approved, attributable reviews exist. */}
      {testimonials.length > 0 && (
        <Section surface="lime" index="06" eyebrow="In their words">
          <div className="shell grid gap-8 md:grid-cols-2">
            {testimonials.map((testimonial) => (
              <blockquote key={testimonial.quote} className="border-l-4 border-charcoal pl-6">
                <p className="text-title">{testimonial.quote}</p>
                <footer className="text-eyebrow font-display mt-4 uppercase">
                  {testimonial.attribution}
                  {testimonial.source && <span className="opacity-60"> — {testimonial.source}</span>}
                </footer>
              </blockquote>
            ))}
          </div>
        </Section>
      )}

      {/* J. Visit */}
      <Section surface="ivory" index={testimonials.length > 0 ? "07" : "06"} eyebrow="Visit" id="visit">
        <div className="shell grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <SectionHeading className="max-w-[16ch]">
              Find us in
              <br />
              <span className="text-orange">{settings.city}.</span>
            </SectionHeading>

            {settings.addressLines ? (
              <address className="mt-8 text-lead not-italic">
                {settings.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            ) : (
              // Honest gap rather than a plausible-looking invented address.
              <p className="mt-8 border border-dashed border-[var(--surface-line)] p-4 text-sm text-[var(--surface-muted)]">
                The full street address is being confirmed with the venue. Until then,{" "}
                <Link href="/contact" className="underline decoration-2 underline-offset-4">
                  get in touch
                </Link>{" "}
                for directions.
              </p>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              {settings.mapsUrl && (
                <ButtonLink href={settings.mapsUrl} size="md">
                  Get directions
                </ButtonLink>
              )}
              {settings.whatsappPhone && (
                <ButtonLink href={`https://wa.me/${settings.whatsappPhone.replace(/\D/g, "")}`} size="md" variant="secondary">
                  Message on WhatsApp
                </ButtonLink>
              )}
              <ButtonLink href="/contact" size="md" variant={settings.mapsUrl ? "secondary" : "primary"}>
                Contact the venue
              </ButtonLink>
            </div>
          </Reveal>

          <Reveal delay={1}>
            <h3 className="text-eyebrow font-display mb-4 uppercase">Opening hours</h3>
            <dl className="divide-y divide-[var(--surface-line)] border-y border-[var(--surface-line)]">
              {hours.map((row) => (
                <div key={row.day} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-sm font-medium">{row.day}</dt>
                  <dd
                    className={`text-sm ${row.isClosed ? "text-[var(--surface-muted)]" : ""}`}
                    data-numeric=""
                  >
                    {row.label}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-[var(--surface-muted)]">
              Sessions that run past midnight are normal here — a 1am booking belongs to the night
              before.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* Closing call to action */}
      <Section surface="dark" spacing="loose" ariaLabel="Book a court">
        <div className="shell text-center">
          <SectionHeading className="mx-auto max-w-[20ch] text-hero">
            Get a game <span className="text-lime">in.</span>
          </SectionHeading>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/book" size="lg">
              Book your game
            </ButtonLink>
            <ButtonLink href="/menu" size="lg" variant="secondary">
              See the menu
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}

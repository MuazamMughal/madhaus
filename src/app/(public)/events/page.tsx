import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { ContactForm } from "@/components/marketing/contact-form";
import { PageHero } from "@/components/ui/page-hero";
import { Section, SectionHeading, Lead } from "@/components/ui/section";
import { formatPkr } from "@/lib/domain/money";
import { formatVenueDateTimeShort } from "@/lib/domain/time";
import { listPublishedEvents } from "@/server/event-queries";
import { getSiteSettings } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: "Events",
    description: `Tournaments, private hire and group bookings at ${settings.brandName} in ${settings.city}.`,
    alternates: { canonical: "/events" },
  };
}

/**
 * /events
 *
 * No invented tournaments. When nothing is published the page says so plainly and turns
 * into what is actually useful — a way to ask about hiring the place.
 */
export default async function EventsPage() {
  const [events, settings] = await Promise.all([listPublishedEvents(), getSiteSettings()]);

  return (
    <>
      <PageHero
        eyebrow="Events"
        title="Get everyone"
        accent="in one place."
        lead={`Tournaments, birthdays, team nights and private hire at ${settings.brandName}.`}
      />

      <Section surface="dark" index="01" eyebrow="What's coming up">
        <div className="shell">
          {events.length === 0 ? (
            <div className="hatch border border-dashed border-charcoal-line p-10 text-center">
              <p className="font-display text-title">Nothing scheduled right now</p>
              <p className="mx-auto mt-3 max-w-lg text-sm text-grey-300">
                There are no events on the calendar at the moment. When the venue runs one it will
                show up here — and if you want to put one on yourself, the form below is the place
                to start.
              </p>
              <div className="mt-8">
                <ButtonLink href="#enquire" variant="secondary">
                  Enquire about an event
                </ButtonLink>
              </div>
            </div>
          ) : (
            <ul className="grid gap-px bg-charcoal-line md:grid-cols-2">
              {events.map((event) => (
                <li key={event.slug}>
                  <Link href={`/events/${event.slug}`} className="surface group flex h-full flex-col p-6 sm:p-8">
                    <p className="text-eyebrow font-display text-lime uppercase" data-numeric="">
                      {formatVenueDateTimeShort(event.startsAt)}
                    </p>
                    <h2 className="text-headline mt-4">{event.title}</h2>

                    <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
                      {event.priceMinor > 0 && (
                        <span data-numeric="">{formatPkr(event.priceMinor)}</span>
                      )}
                      {event.registrationEnabled && event.spacesLeft !== null && (
                        <span className={event.isFull ? "text-negative" : "text-grey-300"}>
                          {event.isFull ? "Full" : `${event.spacesLeft} spaces left`}
                        </span>
                      )}
                    </div>

                    <p className="font-display mt-auto pt-8 text-sm uppercase">
                      <span className="underline decoration-2 decoration-lime underline-offset-4">
                        Details
                      </span>
                      <span aria-hidden="true" className="ml-2 inline-block transition-transform group-hover:translate-x-1">
                        →
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section surface="ivory" index="02" eyebrow="Private hire" id="enquire">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div>
            <SectionHeading className="max-w-[14ch]">Put something on.</SectionHeading>
            <Lead className="mt-6">
              Birthdays, work nights, a tournament between friends. Tell us roughly what you have in
              mind and the venue will come back with what is possible.
            </Lead>
            <p className="mt-6 text-sm text-[var(--surface-muted)]">
              Packages and pricing for private hire have not been set yet, so nothing is quoted
              here — the venue will give you real numbers.
            </p>
          </div>
          <div data-surface="dark" className="surface border border-charcoal-line p-6 sm:p-8">
            <ContactForm defaultKind="private_event" />
          </div>
        </div>
      </Section>
    </>
  );
}

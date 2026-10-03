import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { MediaPanel } from "@/components/ui/media-panel";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { formatPkr } from "@/lib/domain/money";
import { formatVenueDateTimeShort } from "@/lib/domain/time";
import { findPublishedEvent, listPublishedEvents } from "@/server/event-queries";
import { getFeatureFlags } from "@/server/public-queries";

export async function generateStaticParams() {
  const events = await listPublishedEvents(50);
  return events.map((event) => ({ slug: event.slug }));
}

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await findPublishedEvent(slug);
  if (!event) return { title: "Not found", robots: { index: false, follow: false } };

  return {
    title: event.title,
    description: `${event.title} at MadHaus — ${formatVenueDateTimeShort(event.startsAt)}.`,
    alternates: { canonical: `/events/${event.slug}` },
  };
}

/**
 * /events/[slug]
 *
 * Registration only appears when it is switched on AND capacity is known. Without real
 * capacity there is no honest "spaces left", so the page offers an enquiry instead.
 */
export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const [event, flags] = await Promise.all([findPublishedEvent(slug), getFeatureFlags()]);
  if (!event) notFound();

  const registrationLive = flags["events.registration"] === true && event.registrationEnabled;

  return (
    <>
      <PageHero eyebrow={formatVenueDateTimeShort(event.startsAt)} title={event.title} />

      <Section surface="dark" spacing="tight">
        <div className="shell grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          <div>
            <MediaPanel
              image={null}
              aspect="wide"
              motif="crowd"
              sizes="(max-width: 1024px) 100vw, 60vw"
              placeholderLabel={`event — ${event.title}`}
            />
            <p className="mt-8 text-grey-300">
              Full details for this event are managed in the CMS and have not been filled in yet.
            </p>
          </div>

          <aside className="border border-charcoal-line p-6">
            <h2 className="text-eyebrow font-display mb-5 uppercase">Details</h2>
            <dl className="space-y-3 text-sm">
              <Row label="Starts" value={formatVenueDateTimeShort(event.startsAt)} />
              <Row label="Ends" value={formatVenueDateTimeShort(event.endsAt)} />
              {event.priceMinor > 0 && <Row label="Price" value={formatPkr(event.priceMinor)} />}
              {event.capacity !== null && (
                <Row label="Capacity" value={`${event.registeredCount} of ${event.capacity}`} />
              )}
            </dl>

            <div className="mt-8 border-t border-charcoal-line pt-6">
              {registrationLive ? (
                event.isFull ? (
                  <>
                    <span
                      aria-disabled="true"
                      aria-describedby="full-note"
                      className="font-display inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center border-2 border-grey-400 px-6 text-sm text-grey-400 uppercase"
                    >
                      Fully booked
                    </span>
                    <p id="full-note" className="mt-3 text-xs text-grey-300">
                      Every space has gone. Get in touch and the venue will let you know if one
                      frees up.
                    </p>
                  </>
                ) : (
                  <ButtonLink href={`/contact?event=${event.slug}`} size="lg" className="w-full">
                    Register
                  </ButtonLink>
                )
              ) : (
                <>
                  <ButtonLink href="/contact" size="lg" variant="secondary" className="w-full">
                    Ask about this event
                  </ButtonLink>
                  <p className="mt-3 text-xs text-grey-400">
                    Online registration is not switched on for this event. Get in touch and the
                    venue will sort you out.
                  </p>
                </>
              )}
            </div>
          </aside>
        </div>

        <p className="shell mt-12 text-sm">
          <Link href="/events" className="underline decoration-lime decoration-2 underline-offset-4">
            ← All events
          </Link>
        </p>
      </Section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-grey-400">{label}</dt>
      <dd className="text-right font-medium" data-numeric="">
        {value}
      </dd>
    </div>
  );
}

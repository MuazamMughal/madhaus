import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { MediaPanel } from "@/components/ui/media-panel";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { Lead, Section, SectionHeading } from "@/components/ui/section";
import { TableRequestForm } from "@/components/marketing/table-request-form";
import { formatLocalTime12h, formatVenueDate, parseLocalTime } from "@/lib/domain/time";
import { pool } from "@/lib/db/client";
import { getFeatureFlags, getMenuItems } from "@/server/public-queries";
import { getSiteSettings } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: "The café",
    description: `Food and coffee at ${settings.brandName}, ${settings.city}. Dine in or take away, open until 3am.`,
    alternates: { canonical: "/cafe" },
  };
}

/**
 * /cafe
 *
 * The café gets the same design weight as the arena, on its own warm surface. The
 * reservation block appears only when the venue has switched reservations on, and it is
 * worded as a request unless instant confirmation is genuinely possible.
 */
export default async function CafePage() {
  const [flags, featured, settings] = await Promise.all([
    getFeatureFlags(),
    getMenuItems({ limit: 6 }),
    getSiteSettings(),
  ]);

  const { rows } = await pool().query<{ opens_at: string; closes_at: string }>(
    "SELECT opens_at, closes_at FROM operating_hours WHERE NOT is_closed ORDER BY day_of_week LIMIT 1",
  );
  const openFrom = rows[0] ? formatLocalTime12h(parseLocalTime(rows[0].opens_at)) : "5:00 pm";
  const openTo = rows[0] ? formatLocalTime12h(parseLocalTime(rows[0].closes_at)) : "3:00 am";

  const reservationsOn = flags["cafe.tableReservations"] === true;
  const instantConfirm = flags["cafe.tableInstantConfirm"] === true;
  const pickupOn = flags["cafe.pickupOrders"] === true;

  return (
    <>
      <PageHero
        surface="ivory"
        eyebrow="The café"
        title="Come off the court."
        accent="Stay a while."
        lead={`Food and coffee running ${openFrom} to ${openTo}. Dine in or take it away.`}
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/menu" size="lg">
            See the menu
          </ButtonLink>
          {reservationsOn && (
            <ButtonLink href="#reserve" size="lg" variant="secondary">
              {instantConfirm ? "Book a table" : "Request a table"}
            </ButtonLink>
          )}
        </div>
      </PageHero>

      <Section surface="ivory" index="01" eyebrow="What's good">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
          <Reveal>
            <SectionHeading className="max-w-[16ch]">
              Made to eat <span className="text-orange">late.</span>
            </SectionHeading>
            <Lead className="mt-6">
              The kitchen keeps the same hours as the courts, so there is no rush to finish and
              leave. Come in off a game, or come in without playing at all.
            </Lead>

            {featured.length > 0 && (
              <ul className="mt-10 divide-y divide-[var(--surface-line)] border-y border-[var(--surface-line)]">
                {featured.slice(0, 5).map((item) => (
                  <li key={item.slug} className="flex items-baseline justify-between gap-4 py-4">
                    <span className="font-medium">{item.name}</span>
                    <span className="flex shrink-0 items-center gap-3 text-sm">
                      {!item.isAvailable && (
                        <span className="font-display text-[10px] text-[var(--surface-muted)] uppercase">
                          Sold out
                        </span>
                      )}
                      {item.priceLabel && (
                        <span className="text-[var(--surface-muted)]" data-numeric="">
                          {item.priceLabel}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-8">
              <ButtonLink href="/menu" variant="ghost">
                The full menu
              </ButtonLink>
            </div>
          </Reveal>

          <Reveal delay={1} className="grid grid-cols-2 gap-4">
            <MediaPanel
              image={null}
              aspect="portrait"
              motif="cafe"
              sizes="(max-width: 1024px) 50vw, 28vw"
              placeholderLabel="café — the counter, coffee being poured"
            />
            <MediaPanel
              image={null}
              aspect="portrait"
              motif="crowd"
              className="mt-10"
              sizes="(max-width: 1024px) 50vw, 28vw"
              placeholderLabel="café — a table mid-meal, people talking"
            />
          </Reveal>
        </div>
      </Section>

      {/* Court-linked ordering, described honestly: it is an add-on at booking time. */}
      {flags["cafe.courtAddons"] && (
        <Section surface="dark" index="02" eyebrow="On the court">
          <div className="shell shell-content text-center">
            <SectionHeading className="mx-auto max-w-[20ch]">
              Order it <span className="text-lime">to your court.</span>
            </SectionHeading>
            <Lead className="mx-auto mt-6">
              Add food and drinks to a court booking and the kitchen will have it ready for when
              your session ends. Pick your extras while you book.
            </Lead>
            <div className="mt-10">
              <ButtonLink href="/book" size="lg">
                Book a court
              </ButtonLink>
            </div>
          </div>
        </Section>
      )}

      {reservationsOn && (
        <Section surface="ivory" index="03" eyebrow="Tables" id="reserve">
          <div className="shell grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <SectionHeading className="max-w-[14ch]">
                {instantConfirm ? "Book a table." : "Request a table."}
              </SectionHeading>
              <Lead className="mt-6">
                {instantConfirm
                  ? "Pick a time and it is yours."
                  : "Tell us when you are coming and how many. The venue will come back to you to confirm."}
              </Lead>
              {!instantConfirm && (
                <p className="mt-6 border-l-4 border-orange pl-4 text-sm">
                  Sending this is not a booking. Nothing is held until the venue confirms it, and
                  they will always come back to you either way.
                </p>
              )}
              {settings.phone && (
                <p className="mt-6 text-sm text-[var(--surface-muted)]">
                  In a hurry? Call{" "}
                  <a href={`tel:${settings.phone}`} className="underline decoration-2 underline-offset-4">
                    {settings.phone}
                  </a>
                  .
                </p>
              )}
            </div>

            <div className="border border-[var(--surface-line)] p-6 sm:p-8">
              <TableRequestForm
                instantConfirm={instantConfirm}
                today={formatVenueDate(new Date())}
                openFrom={openFrom}
                openTo={openTo}
              />
            </div>
          </div>
        </Section>
      )}

      {/* Pickup ordering is off, and the page says so rather than showing a dead button. */}
      {!pickupOn && (
        <Section surface="dark" spacing="tight" ariaLabel="Takeaway">
          <div className="shell shell-content text-center">
            <p className="text-sm text-grey-300">
              Takeaway is available at the counter. Online pickup ordering is not switched on yet
              — order in person or give the venue a call.
            </p>
          </div>
        </Section>
      )}
    </>
  );
}

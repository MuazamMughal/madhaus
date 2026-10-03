import type { Metadata } from "next";
import Link from "next/link";
import { BookingControls } from "@/components/booking/booking-controls";
import { DetailsForm } from "@/components/booking/details-form";
import { SlotGrid } from "@/components/booking/slot-grid";
import { Section } from "@/components/ui/section";
import { formatPkr } from "@/lib/domain/money";
import { formatLocalTime12h, formatVenueDate, formatVenueDateLong, parseLocalTime } from "@/lib/domain/time";
import {
  BookingError,
  getDayAvailability,
  loadBookingDefaults,
  loadSportBySlug,
  quote,
} from "@/server/booking-service";
import { getFeatureFlags, getPublicSports } from "@/server/public-queries";
import { enabledAdapters } from "@/lib/payments/adapters";

export const metadata: Metadata = {
  title: "Book a court",
  description:
    "Check live availability and book a padel or cricket court. Sessions run from 5pm until 3am.",
  // A live availability page has nothing useful to offer a search index and should never
  // be cached as if it did.
  robots: { index: false, follow: true },
};

// Availability is only ever true at the moment it is read.
export const dynamic = "force-dynamic";

/**
 * /book
 *
 * Driven entirely by search params, so every state is a shareable URL, the back button
 * works, and the whole picker functions without JavaScript. The only client component is
 * the details form, and even that degrades to a normal POST.
 */
export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const params = await searchParams;
  const sports = await getPublicSports();

  if (sports.length === 0) {
    return (
      <Section surface="dark">
        <div className="shell-content shell">
          <h1 className="text-display">Booking is closed</h1>
          <p className="text-lead mt-6 text-grey-300">
            No courts are open for online booking at the moment. Please{" "}
            <Link href="/contact" className="underline decoration-lime decoration-2 underline-offset-4">
              contact the venue
            </Link>
            .
          </p>
        </div>
      </Section>
    );
  }

  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const requestedSport = first(params.sport);
  const sportSlug = sports.some((entry) => entry.slug === requestedSport)
    ? requestedSport!
    : sports[0].slug;

  const loaded = await loadSportBySlug(sportSlug);
  const defaults = await loadBookingDefaults();
  const flags = await getFeatureFlags();
  // Only offer online payment when the venue has actually published JazzCash details.
  const onlinePaymentAvailable = enabledAdapters().some((adapter) => adapter.id === "jazzcash");

  const today = formatVenueDate(new Date());
  const requestedDate = first(params.date);
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today;

  const allowedDurations = loaded ? [...loaded.sport.allowedDurations] : [60];
  const requestedDuration = Number(first(params.duration));
  const duration = allowedDurations.includes(requestedDuration)
    ? requestedDuration
    : (loaded?.sport.defaultDuration ?? allowedDurations[0]);

  const selectedStart = first(params.start);

  let availability: Awaited<ReturnType<typeof getDayAvailability>> | null = null;
  let availabilityError: string | null = null;
  try {
    availability = await getDayAvailability({ date, sportSlug, durationMinutes: duration });
  } catch (error) {
    availabilityError =
      error instanceof BookingError ? error.message : "We could not load availability just now.";
  }

  const baseHref = `/book?sport=${sportSlug}&date=${date}&duration=${duration}`;
  const sportName = sports.find((entry) => entry.slug === sportSlug)?.name ?? sportSlug;

  // Price the chosen slot. Only meaningful once a start time has been picked.
  const chosenSlot = selectedStart
    ? availability?.slots.find((slot) => slot.startsAtLocal === selectedStart && slot.available)
    : undefined;

  let price: Awaited<ReturnType<typeof quote>> | null = null;
  let priceError: string | null = null;
  if (chosenSlot) {
    try {
      price = await quote({
        sportSlug,
        startsAt: chosenSlot.startsAt,
        durationMinutes: duration,
      });
    } catch (error) {
      priceError =
        error instanceof Error
          ? error.message
          : "We could not price that slot. Please contact the venue.";
    }
  }

  return (
    <Section surface="dark" spacing="tight">
      <div className="shell">
        <header className="mb-12 max-w-3xl">
          <p className="text-eyebrow font-display mb-4 text-lime uppercase">Book a court</p>
          <h1 className="text-display">
            Pick your <span className="text-lime">slot.</span>
          </h1>
          <p className="text-lead mt-6 text-grey-300">
            Live availability. Sessions run from 5pm until 3am — a 1am start belongs to the night
            before.
          </p>
        </header>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16">
          <div>
            <BookingControls
              sports={sports}
              durations={allowedDurations}
              selected={{ sport: sportSlug, date, duration }}
              horizonDays={defaults.bookingHorizonDays}
              today={today}
            />

            <div className="mt-12 border-t border-charcoal-line pt-10">
              <h2 className="text-headline mb-2">
                {formatVenueDateLong(new Date(`${date}T12:00:00Z`))}
              </h2>
              <p className="mb-8 text-sm text-grey-400">
                {sportName} · {duration >= 60 ? `${duration / 60} hour${duration > 60 ? "s" : ""}` : `${duration} min`}
                {availability && !availability.isClosed && ` · ${availability.resourceName}`}
              </p>

              {/*
                A live region: when the date or sport changes, a screen-reader user is
                told how many slots came back rather than having to go looking.
              */}
              <p aria-live="polite" className="sr-only">
                {availabilityError
                  ? availabilityError
                  : availability?.isClosed
                    ? (availability.closedReason ?? "Closed")
                    : `${availability?.slots.filter((slot) => slot.available).length ?? 0} of ${availability?.slots.length ?? 0} times available.`}
              </p>

              {availabilityError ? (
                <EmptyState title="Availability is unavailable" body={availabilityError} />
              ) : availability?.isClosed ? (
                <EmptyState
                  title="Nothing on this night"
                  body={availability.closedReason ?? "The venue is closed."}
                />
              ) : !availability?.hasAvailableSlot ? (
                <EmptyState
                  title="Fully booked"
                  body={`Every ${duration >= 60 ? `${duration / 60}-hour` : `${duration}-minute`} slot for ${sportName} is taken on this night. Try another date, a different length, or give the venue a call.`}
                />
              ) : (
                <SlotGrid
                  slots={availability.slots}
                  baseHref={baseHref}
                  selectedLocal={selectedStart}
                  sportChangeBufferMinutes={loaded?.resource.sportChangeBufferMinutes}
                />
              )}
            </div>
          </div>

          {/* Summary rail. Sticky on desktop, in flow on mobile. */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="border border-charcoal-line p-6">
              <h2 className="text-eyebrow font-display mb-5 uppercase">Your booking</h2>

              {!chosenSlot ? (
                <p className="text-sm text-grey-400">
                  {selectedStart
                    ? "That time is no longer available. Please choose another."
                    : "Choose a start time to see the price and finish booking."}
                </p>
              ) : (
                <>
                  <dl className="space-y-3 border-b border-charcoal-line pb-5 text-sm">
                    <Row label="Sport" value={sportName} />
                    <Row label="Court" value={availability?.resourceName ?? "—"} />
                    <Row label="Date" value={formatVenueDateLong(chosenSlot.startsAt)} />
                    <Row
                      label="Time"
                      value={`${formatLocalTime12h(parseLocalTime(selectedStart!))} — ${formatLocalTime12h(parseLocalTime(selectedStart!) + duration)}`}
                    />
                  </dl>

                  {priceError ? (
                    <p className="mt-5 text-sm text-negative">
                      <span aria-hidden="true">⚠ </span>
                      {priceError}
                    </p>
                  ) : price ? (
                    <>
                      <dl className="mt-5 space-y-2 text-sm">
                        {price.bands.map((band) => (
                          <div key={`${band.startsAtLocal}-${band.ruleId}`} className="flex justify-between gap-3">
                            <dt className="text-grey-400">
                              {band.startsAtLocal}–{band.endsAtLocal}
                              {band.isPeak && (
                                <span className="ml-2 text-[10px] tracking-wider text-lime uppercase">
                                  Peak
                                </span>
                              )}
                            </dt>
                            <dd data-numeric="">{formatPkr(band.amountMinor)}</dd>
                          </div>
                        ))}
                        {price.discountMinor > 0 && (
                          <div className="flex justify-between gap-3 text-lime">
                            <dt>{price.discountLabel}</dt>
                            <dd data-numeric="">−{formatPkr(price.discountMinor)}</dd>
                          </div>
                        )}
                      </dl>

                      <div className="mt-5 flex items-baseline justify-between border-t border-charcoal-line pt-5">
                        <span className="font-display text-sm uppercase">Total</span>
                        <span className="font-display text-2xl text-lime" data-numeric="">
                          {formatPkr(price.totalMinor)}
                        </span>
                      </div>

                      {flags["pricing.isSample"] && (
                        <p className="mt-2 text-xs text-grey-400">
                          Indicative — the venue&apos;s confirmed price list is pending.
                        </p>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </div>

            {chosenSlot && price && !priceError && (
              <div className="mt-6 border border-charcoal-line p-6">
                <h2 className="text-eyebrow font-display mb-5 uppercase">Request this slot</h2>
                <DetailsForm
                  sport={sportSlug}
                  date={date}
                  start={selectedStart!}
                  duration={duration}
                  expectedTotalMinor={price.totalMinor}
                  onlinePaymentAvailable={onlinePaymentAvailable}
                />
              </div>
            )}
          </aside>
        </div>
      </div>
    </Section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-grey-400">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="hatch border border-dashed border-charcoal-line p-8 text-center">
      <p className="font-display text-title">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-grey-300">{body}</p>
      <p className="mt-6 text-sm">
        <Link href="/contact" className="underline decoration-lime decoration-2 underline-offset-4">
          Contact the venue
        </Link>
      </p>
    </div>
  );
}

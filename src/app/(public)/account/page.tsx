import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { FindBookingForm } from "@/components/booking/find-booking-form";
import { getCustomerSession } from "@/lib/auth/session";
import { formatPkr } from "@/lib/domain/money";
import { bookingStatusTone, humanBookingStatus, humanPaymentStatus } from "@/lib/domain/booking-state";
import { formatVenueDateTimeShort } from "@/lib/domain/time";
import { pool } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "Your bookings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /account
 *
 * Accounts are optional here — a name and a phone number is all a booking needs. So this
 * page does two jobs: it lists bookings for someone who is signed in, and for everyone
 * else it is a way back into a booking from the link they were sent.
 */
export default async function AccountPage() {
  const session = await getCustomerSession();

  if (!session) {
    return (
      <>
        <PageHero
          eyebrow="Your bookings"
          title="Find your"
          accent="booking."
          lead="You do not need an account to book with us. Open the link we sent you, or look it up below."
        />

        <Section surface="dark" spacing="tight">
          <div className="shell grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="border border-charcoal-line p-6 sm:p-8">
              <h2 className="text-title font-display mb-5">Open a booking</h2>
              <FindBookingForm />
            </div>

            <div>
              <h2 className="text-title font-display mb-5">Lost the link?</h2>
              <p className="text-grey-300">
                Your confirmation link is the only way in, because a booking reference on its own
                is not a password — anyone could guess one. If you no longer have the link, get in
                touch and the venue will look it up for you.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/contact" variant="secondary">
                  Contact the venue
                </ButtonLink>
                <ButtonLink href="/book">Book a court</ButtonLink>
              </div>
            </div>
          </div>
        </Section>
      </>
    );
  }

  // "Upcoming" is decided by the database clock, the same one the booking engine uses, so
  // the two can never disagree about whether a session has started.
  const { rows } = await pool().query(
    `SELECT b.reference, b.starts_at, b.status, b.payment_status, b.total_minor,
            s.name AS sport_name,
            (b.starts_at > now() AND b.status <> 'cancelled') AS is_upcoming
       FROM bookings b JOIN sports s ON s.id = b.sport_id
      WHERE b.customer_id = $1
      ORDER BY b.starts_at DESC
      LIMIT 50`,
    [session.customerId],
  );

  const upcoming = rows.filter((row) => row.is_upcoming);
  const past = rows.filter((row) => !row.is_upcoming);

  return (
    <>
      <PageHero eyebrow="Your bookings" title={`Hello, ${session.name}.`} />

      <Section surface="dark" spacing="tight">
        <div className="shell shell-content space-y-12">
          <BookingList
            title="Coming up"
            rows={upcoming}
            emptyTitle="Nothing booked"
            emptyBody="You have no sessions coming up."
          />
          <BookingList
            title="Past bookings"
            rows={past}
            emptyTitle="Nothing yet"
            emptyBody="Your past sessions will show up here."
          />

          <div className="border-t border-charcoal-line pt-8">
            <ButtonLink href="/book" size="lg">
              Book another
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}

function BookingList({
  title,
  rows,
  emptyTitle,
  emptyBody,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <section>
      <h2 className="text-eyebrow font-display mb-4 uppercase">{title}</h2>
      {rows.length === 0 ? (
        <div className="hatch border border-dashed border-charcoal-line p-8 text-center">
          <p className="font-display text-title">{emptyTitle}</p>
          <p className="mt-2 text-sm text-grey-400">{emptyBody}</p>
        </div>
      ) : (
        <ul className="divide-y divide-charcoal-line border-y border-charcoal-line">
          {rows.map((row) => {
            const tone = bookingStatusTone(row.status as never);
            const toneClass = {
              positive: "text-positive",
              pending: "text-pending",
              negative: "text-negative",
              neutral: "text-grey-400",
            }[tone];

            return (
              <li key={row.reference as string} className="flex flex-wrap justify-between gap-4 py-4">
                <div>
                  <p className="font-medium">
                    {row.sport_name as string}{" "}
                    <span className="text-grey-400" data-numeric="">
                      · {row.reference as string}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-grey-400">
                    {formatVenueDateTimeShort(new Date(row.starts_at as string))}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className={toneClass}>{humanBookingStatus(row.status as never)}</p>
                  <p className="text-grey-400" data-numeric="">
                    {formatPkr(row.total_minor as number)} ·{" "}
                    {humanPaymentStatus(row.payment_status as never)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

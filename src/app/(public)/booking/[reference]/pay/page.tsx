import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentProofForm } from "@/components/booking/payment-proof-form";
import { Section } from "@/components/ui/section";
import { formatPkr } from "@/lib/domain/money";
import { formatLocalTime12h, formatVenueDateLong, toVenueWallClock } from "@/lib/domain/time";
import { findBookingForPayment } from "@/server/booking-access";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Pay for your booking",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * /booking/[reference]/pay
 *
 * Reached from the link the venue emails once they have confirmed the slot is free. Shows
 * the JazzCash account details and takes the transaction reference back.
 *
 * Opened with the single-purpose payment token, not the booking's own access token, so
 * forwarding this link does not hand over the ability to cancel the booking.
 */
export default async function PayPage({
  params,
  searchParams,
}: PageProps<"/booking/[reference]/pay">) {
  const { reference } = await params;
  const query = await searchParams;
  const token = Array.isArray(query.t) ? query.t[0] : query.t;

  const booking = await findBookingForPayment({ reference, token });
  if (!booking) notFound();

  const env = serverEnv();
  const accountTitle = env.JAZZCASH_ACCOUNT_TITLE;
  const accountNumber = env.JAZZCASH_ACCOUNT_NUMBER;

  const startWall = toVenueWallClock(booking.startsAt);
  const endWall = toVenueWallClock(booking.endsAt);

  if (booking.status === "cancelled") {
    return (
      <Section surface="dark">
        <div className="shell shell-content">
          <p className="text-eyebrow font-display mb-4 text-negative uppercase">Cancelled</p>
          <h1 className="text-display">Do not send payment.</h1>
          <p className="text-lead mt-6 text-grey-300">
            This booking was cancelled, so there is nothing to pay. If you have already sent
            money, contact the venue and they will refund it.
          </p>
        </div>
      </Section>
    );
  }

  if (booking.paymentStatus === "paid") {
    return (
      <Section surface="dark">
        <div className="shell shell-content">
          <p className="text-eyebrow font-display mb-4 text-positive uppercase">Paid</p>
          <h1 className="text-display">All settled.</h1>
          <p className="text-lead mt-6 text-grey-300">
            We have your payment for {booking.reference} — nothing more to do. See you on the
            court.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section surface="dark" spacing="tight">
      <div className="shell grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <div className="order-2 lg:order-1">
          <p className="text-eyebrow font-display mb-4 text-lime uppercase">Payment</p>
          <h1 className="text-display">
            Pay to <span className="text-lime">confirm.</span>
          </h1>
          <p className="text-lead mt-6 max-w-xl text-grey-300">
            Your court is held. Send the amount by JazzCash, then give us the transaction ID
            below and we will confirm as soon as we have matched it.
          </p>

          {/* The account to send to. Rendered only when the venue has supplied it. */}
          {accountTitle && accountNumber ? (
            <div data-surface="lime" className="surface mt-10 p-6">
              <h2 className="text-eyebrow font-display mb-5 uppercase">Send to</h2>
              <dl className="space-y-4">
                <Detail label="Account title" value={accountTitle} />
                <Detail label="JazzCash number" value={accountNumber} copyable />
                <Detail label="Amount" value={formatPkr(booking.totalMinor)} />
                <Detail label="Reference to quote" value={booking.reference} />
              </dl>
            </div>
          ) : (
            <div className="mt-10 border-l-4 border-pending bg-charcoal-raised p-5">
              <p className="font-semibold text-pending">Payment details not set up yet</p>
              <p className="mt-2 text-sm text-grey-200">
                The venue has not published its JazzCash account details. Please{" "}
                <Link href="/contact" className="underline decoration-lime decoration-2 underline-offset-4">
                  get in touch
                </Link>{" "}
                and they will give you the details directly.
              </p>
            </div>
          )}

          <div className="mt-10 border-t border-charcoal-line pt-10">
            <h2 className="text-headline mb-6">Tell us you have paid</h2>
            <PaymentProofForm
              reference={booking.reference}
              token={token ?? ""}
              alreadySubmitted={booking.paymentStatus === "pending_verification"}
            />
          </div>
        </div>

        <aside className="order-1 lg:order-2">
          <div className="border border-charcoal-line p-6">
            <h2 className="text-eyebrow font-display mb-5 uppercase">Your booking</h2>
            <dl className="space-y-3 text-sm">
              <Row label="Reference" value={booking.reference} numeric />
              <Row label="Sport" value={booking.sportName} />
              <Row label="Court" value={booking.resourceName} />
              <Row label="Date" value={formatVenueDateLong(booking.startsAt)} />
              <Row
                label="Time"
                value={`${formatLocalTime12h(startWall.hour * 60 + startWall.minute)} — ${formatLocalTime12h(endWall.hour * 60 + endWall.minute)}`}
                numeric
              />
            </dl>
            <div className="mt-5 flex items-baseline justify-between border-t border-charcoal-line pt-5">
              <span className="font-display text-sm uppercase">To pay</span>
              <span className="font-display text-2xl text-lime" data-numeric="">
                {formatPkr(booking.totalMinor)}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </Section>
  );
}

function Detail({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div>
      <dt className="text-eyebrow font-display text-[var(--surface-muted)] uppercase">{label}</dt>
      <dd
        className={`mt-1 text-xl font-semibold ${copyable ? "select-all" : ""}`}
        data-numeric=""
      >
        {value}
      </dd>
    </div>
  );
}

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-grey-400">{label}</dt>
      <dd className="text-right font-medium" data-numeric={numeric ? "" : undefined}>
        {value}
      </dd>
    </div>
  );
}

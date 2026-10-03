import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ManageBooking } from "@/components/booking/manage-booking";
import { Section } from "@/components/ui/section";
import { formatPkr } from "@/lib/domain/money";
import {
  bookingStatusTone,
  describePaymentState,
  explainBookingStatus,
  humanBookingStatus,
} from "@/lib/domain/booking-state";
import {
  formatLocalTime12h,
  formatVenueDate,
  formatVenueDateLong,
  toVenueWallClock,
} from "@/lib/domain/time";
import { whatsappClickToChatUrl } from "@/lib/domain/phone";
import {
  bookingNotifications,
  cancellationEligibility,
  findBookingForCustomer,
  rescheduleEligibility,
} from "@/server/booking-access";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Your booking",
  // One customer's private record. Never indexed, never followed.
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * /booking/[reference]
 *
 * The page a customer keeps. It states plainly what is confirmed and what is not, offers
 * the actions they are actually allowed to take, and never implies a request is a
 * reservation.
 */
export default async function BookingPage({
  params,
  searchParams,
}: PageProps<"/booking/[reference]">) {
  const { reference } = await params;
  const query = await searchParams;
  const token = Array.isArray(query.t) ? query.t[0] : query.t;
  const isNew = query.new === "1";

  const booking = await findBookingForCustomer({ reference, token });
  // Same response for "no such booking" and "wrong token", so the page cannot be used to
  // discover which references exist.
  if (!booking) notFound();

  const [settings, notifications] = await Promise.all([
    getSiteSettings(),
    bookingNotifications(booking.id),
  ]);

  const eligibility = cancellationEligibility(booking);
  const canMove = rescheduleEligibility(booking);
  const startWall = toVenueWallClock(booking.startsAt);
  const endWall = toVenueWallClock(booking.endsAt);
  const tone = bookingStatusTone(booking.status);

  const toneClasses = {
    positive: "border-positive text-positive",
    pending: "border-pending text-pending",
    negative: "border-negative text-negative",
    neutral: "border-grey-400 text-grey-300",
  } as const;

  // Icons carry the status alongside colour and text, so nothing depends on hue alone.
  const toneIcon = { positive: "✓", pending: "◷", negative: "✕", neutral: "•" } as const;

  return (
    <Section surface="dark" spacing="tight">
      <div className="shell shell-content">
        {isNew && booking.status !== "cancelled" && (
          <p
            role="status"
            className="mb-8 border-l-4 border-lime bg-charcoal-raised p-4 text-sm"
          >
            {booking.status === "confirmed"
              ? "You are on the court. We have sent the details to your phone."
              : "We have your request. The venue will confirm it shortly — keep an eye on your phone."}
          </p>
        )}

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-eyebrow font-display mb-3 text-grey-400 uppercase">Booking</p>
            <h1 className="text-display" data-numeric="">
              {booking.reference}
            </h1>
          </div>

          <p
            className={`font-display inline-flex items-center gap-2 border-2 px-4 py-2 text-sm uppercase ${toneClasses[tone]}`}
          >
            <span aria-hidden="true">{toneIcon[tone]}</span>
            {humanBookingStatus(booking.status)}
          </p>
        </div>

        <p className="text-lead mt-6 text-grey-300">{explainBookingStatus(booking.status)}</p>

        {/* The booking itself */}
        <dl className="mt-12 grid gap-px border border-charcoal-line bg-charcoal-line sm:grid-cols-2">
          <Cell label="Sport" value={booking.sportName} />
          <Cell label="Court" value={booking.resourceName} />
          <Cell label="Date" value={formatVenueDateLong(booking.startsAt)} />
          <Cell
            label="Time"
            value={`${formatLocalTime12h(startWall.hour * 60 + startWall.minute)} — ${formatLocalTime12h(endWall.hour * 60 + endWall.minute)}`}
            numeric
          />
          <Cell label="Booked for" value={booking.customerName} />
          <Cell
            label="Length"
            value={
              booking.durationMinutes >= 60
                ? `${booking.durationMinutes / 60} hour${booking.durationMinutes > 60 ? "s" : ""}`
                : `${booking.durationMinutes} minutes`
            }
          />
        </dl>

        {/* Money. Collected, owed and refunded are distinguished, never merged. */}
        <section className="mt-12">
          <h2 className="text-eyebrow font-display mb-5 uppercase">Payment</h2>
          <dl className="space-y-3 border-y border-charcoal-line py-5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-grey-400">Subtotal</dt>
              <dd data-numeric="">{formatPkr(booking.subtotalMinor)}</dd>
            </div>
            {booking.discountMinor > 0 && (
              <div className="flex justify-between gap-3 text-lime">
                <dt>Discount</dt>
                <dd data-numeric="">−{formatPkr(booking.discountMinor)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 font-semibold">
              <dt>Total</dt>
              <dd data-numeric="">{formatPkr(booking.totalMinor)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-grey-400">Status</dt>
              <dd>
                {describePaymentState({
                  paymentStatus: booking.paymentStatus,
                  paymentPreference: booking.paymentPreference,
                  slotApproved: booking.slotApprovedAt !== null,
                })}
              </dd>
            </div>
            {booking.amountRefundedMinor > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-grey-400">Refunded</dt>
                <dd data-numeric="">{formatPkr(booking.amountRefundedMinor)}</dd>
              </div>
            )}
          </dl>
          {booking.paymentStatus === "unpaid" &&
            booking.paymentPreference === "at_venue" &&
            booking.status === "confirmed" && (
              <p className="mt-3 text-sm text-grey-400">Pay at the venue when you arrive.</p>
            )}
          {booking.paymentStatus === "unpaid" && booking.paymentPreference === "online" && (
            <p className="mt-3 text-sm text-grey-300">
              {booking.slotApprovedAt
                ? "We have emailed you a JazzCash payment link. Your court is held until you pay."
                : "Nothing to pay yet. Once the venue confirms the slot we will email you a JazzCash link — please do not send anything before then."}
            </p>
          )}
          {booking.paymentStatus === "pending_verification" && (
            <p className="mt-3 text-sm text-pending">
              <span aria-hidden="true">◷ </span>
              We have your transfer receipt and a member of staff is checking it. This is not a
              confirmed booking yet.
            </p>
          )}
        </section>

        {/* Actions */}
        <ManageBooking
          reference={booking.reference}
          token={token ?? ""}
          eligibility={eligibility}
          rescheduleEligibility={canMove}
          status={booking.status}
          today={formatVenueDate(new Date())}
          icsHref={`/api/bookings/${booking.reference}/calendar?t=${encodeURIComponent(token ?? "")}`}
          mapsUrl={settings.mapsUrl}
          whatsappUrl={
            settings.whatsappPhone
              ? whatsappClickToChatUrl(
                  settings.whatsappPhone,
                  `Hi, I have a booking — reference ${booking.reference}.`,
                )
              : null
          }
          phone={settings.phone}
        />

        {/* Notification history. Honest about what has actually gone out. */}
        {notifications.length > 0 && (
          <section className="mt-16" data-print-hide="">
            <h2 className="text-eyebrow font-display mb-5 uppercase">Messages about this booking</h2>
            <ul className="divide-y divide-charcoal-line border-y border-charcoal-line text-sm">
              {notifications.map((entry, index) => (
                <li key={index} className="flex flex-wrap justify-between gap-3 py-3">
                  <span>
                    {entry.template.replace(/_/g, " ")}{" "}
                    <span className="text-grey-400">via {entry.channel}</span>
                  </span>
                  <span className="text-grey-400">
                    {entry.status === "sent" && entry.sentAt
                      ? `Sent ${formatVenueDateLong(entry.sentAt)}`
                      : entry.status === "queued"
                        ? "Queued"
                        : entry.status === "failed"
                          ? "Delivery failed — we will try again"
                          : entry.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-16 text-sm text-grey-400" data-print-hide="">
          Need something changed?{" "}
          <Link href="/contact" className="underline decoration-lime decoration-2 underline-offset-4">
            Contact the venue
          </Link>
          .
        </p>
      </div>
    </Section>
  );
}

function Cell({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="surface p-5">
      <dt className="text-eyebrow font-display text-grey-400 uppercase">{label}</dt>
      <dd className="mt-2 text-lg font-medium" data-numeric={numeric ? "" : undefined}>
        {value}
      </dd>
    </div>
  );
}

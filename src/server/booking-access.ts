import { pool } from "@/lib/db/client";
import { accessTokenMatches, normaliseReference } from "@/lib/domain/reference";
import type { BookingStatus, PaymentStatus } from "@/lib/domain/booking-state";

/**
 * Authorised access to a single booking.
 *
 * A booking reference is quotable over the phone, which means it must NOT be a
 * credential. Opening /booking/[reference] therefore needs the token from the
 * confirmation link as well, compared in constant time against a stored hash. A signed-in
 * customer can open their own bookings without the token.
 *
 * The failure mode is deliberately the same shape for "no such booking" and "wrong
 * token": neither confirms that a reference exists.
 */

export interface BookingView {
  id: string;
  reference: string;
  sportName: string;
  sportSlug: string;
  resourceName: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  partySize: number | null;
  notes: string | null;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountRefundedMinor: number;
  pricingSnapshot: Record<string, unknown>;
  policySnapshot: { cancellationCutoffHours?: number; rescheduleCutoffHours?: number };
  paymentMethod: string | null;
  paymentPreference: "at_venue" | "online";
  slotApprovedAt: Date | null;
  /** What the venue recorded from the confirmation call. Internal, never shown publicly. */
  approvalNote: string | null;
  declinedReason: string | null;
  holdExpiresAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
}

export async function findBookingForCustomer(args: {
  reference: string;
  token?: string | null;
  /** Set when a signed-in customer is asking. */
  customerId?: string | null;
}): Promise<BookingView | null> {
  const reference = normaliseReference(args.reference);
  if (!reference) return null;

  const { rows } = await pool().query(
    `SELECT b.*, s.name AS sport_name, s.slug AS sport_slug, r.name AS resource_name
       FROM bookings b
       JOIN sports s ON s.id = b.sport_id
       JOIN resources r ON r.id = b.resource_id
      WHERE b.reference = $1`,
    [reference],
  );
  if (rows.length === 0) return null;
  const row = rows[0];

  const ownsBooking = Boolean(args.customerId) && row.customer_id === args.customerId;
  const tokenOk = Boolean(args.token) && accessTokenMatches(args.token!, row.access_token_hash);

  if (!ownsBooking && !tokenOk) return null;

  return toBookingView(row);
}

/** May this booking still be cancelled online, and if not, why not? */
export function cancellationEligibility(
  booking: BookingView,
  now = new Date(),
): { eligible: boolean; reason: string; cutoffHours: number } {
  const cutoffHours = booking.policySnapshot.cancellationCutoffHours ?? 12;

  if (booking.status === "cancelled") {
    return { eligible: false, reason: "This booking has already been cancelled.", cutoffHours };
  }
  if (booking.status === "completed" || booking.status === "no_show") {
    return { eligible: false, reason: "This session has already passed.", cutoffHours };
  }

  const cutoff = new Date(booking.startsAt.getTime() - cutoffHours * 3_600_000);
  if (now.getTime() > cutoff.getTime()) {
    return {
      eligible: false,
      reason: `Online cancellation closed ${cutoffHours} hours before the start. Please call the venue.`,
      cutoffHours,
    };
  }

  return { eligible: true, reason: "", cutoffHours };
}

/**
 * Map a joined booking row to the view the pages render.
 *
 * `pg` hands back untyped rows, so the cast happens here, once, rather than at every
 * field in both lookup functions.
 */
function toBookingView(row: Record<string, never>): BookingView {
  return {
    id: row.id,
    reference: row.reference,
    sportName: row.sport_name,
    sportSlug: row.sport_slug,
    resourceName: row.resource_name,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    durationMinutes: row.duration_minutes,
    status: row.status,
    paymentStatus: row.payment_status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    partySize: row.party_size,
    notes: row.notes,
    currency: row.currency,
    subtotalMinor: row.subtotal_minor,
    discountMinor: row.discount_minor,
    totalMinor: row.total_minor,
    amountPaidMinor: row.amount_paid_minor,
    amountRefundedMinor: row.amount_refunded_minor,
    pricingSnapshot: row.pricing_snapshot ?? {},
    policySnapshot: row.policy_snapshot ?? {},
    paymentMethod: row.payment_method,
    paymentPreference: row.payment_preference,
    slotApprovedAt: row.slot_approved_at ? new Date(row.slot_approved_at) : null,
    approvalNote: row.approval_note,
    declinedReason: row.declined_reason,
    holdExpiresAt: row.hold_expires_at ? new Date(row.hold_expires_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    cancellationReason: row.cancellation_reason,
    createdAt: new Date(row.created_at),
  };
}


/**
 * Resolve a booking from the single-purpose payment token.
 *
 * Deliberately separate from `findBookingForCustomer`: this token only ever opens the
 * payment page. It cannot be used to cancel or reschedule, so a forwarded payment link
 * does not hand over control of someone's booking.
 */
export async function findBookingForPayment(args: {
  reference: string;
  token?: string | null;
}): Promise<BookingView | null> {
  const reference = normaliseReference(args.reference);
  if (!reference || !args.token) return null;

  const { rows } = await pool().query(
    `SELECT b.*, s.name AS sport_name, s.slug AS sport_slug, r.name AS resource_name
       FROM bookings b
       JOIN sports s ON s.id = b.sport_id
       JOIN resources r ON r.id = b.resource_id
      WHERE b.reference = $1`,
    [reference],
  );
  if (rows.length === 0) return null;
  const row = rows[0];

  if (!row.payment_token_hash) return null;
  if (!accessTokenMatches(args.token, row.payment_token_hash)) return null;

  return toBookingView(row);
}

/**
 * May this booking still be moved online?
 *
 * Separate from cancellation because the two cutoffs are configured separately: a venue
 * might happily move a booking an hour before while refusing to cancel it.
 */
export function rescheduleEligibility(
  booking: BookingView,
  now = new Date(),
): { eligible: boolean; reason: string; cutoffHours: number } {
  const cutoffHours = booking.policySnapshot.rescheduleCutoffHours ?? 12;

  if (booking.status === "cancelled") {
    return { eligible: false, reason: "This booking was cancelled.", cutoffHours };
  }
  if (booking.status === "completed" || booking.status === "no_show") {
    return { eligible: false, reason: "This session has already passed.", cutoffHours };
  }
  if (booking.status === "held") {
    return {
      eligible: false,
      reason: "This slot is still being held while you finish booking — pick a different time instead.",
      cutoffHours,
    };
  }

  const cutoff = new Date(booking.startsAt.getTime() - cutoffHours * 3_600_000);
  if (now.getTime() > cutoff.getTime()) {
    return {
      eligible: false,
      reason: `Online changes closed ${cutoffHours} hours before the start. Please call the venue.`,
      cutoffHours,
    };
  }

  return { eligible: true, reason: "", cutoffHours };
}

/** The notification history shown on the booking page. */
export async function bookingNotifications(bookingId: string): Promise<
  Array<{ channel: string; template: string; status: string; createdAt: Date; sentAt: Date | null }>
> {
  const { rows } = await pool().query(
    `SELECT channel, template, status, created_at, sent_at
       FROM notifications WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [bookingId],
  );
  return rows.map((row) => ({
    channel: row.channel,
    template: row.template,
    status: row.status,
    createdAt: new Date(row.created_at),
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
  }));
}

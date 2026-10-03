import { pool } from "@/lib/db/client";
import { venueDateToInstant, addVenueDays, type VenueDate } from "@/lib/domain/time";
import type { BookingStatus, PaymentStatus } from "@/lib/domain/booking-state";

/**
 * Dashboard reads.
 *
 * Two things these queries are careful about:
 *
 *   1. A "day" is the venue's trading night, 17:00 to 03:00, not midnight to midnight.
 *      Everything here works from the opening window of a business date, so the 1am
 *      bookings appear on the shift that is actually serving them.
 *
 *   2. Money that has been collected is never mixed with money that is merely owed.
 *      Revenue figures come from payment records; expected income is reported separately
 *      and labelled as such.
 */

export interface ScheduleEntry {
  id: string;
  reference: string;
  /** What the venue recorded from the confirmation call, if anything. */
  approvalNote: string | null;
  sportName: string;
  sportSlug: string;
  resourceName: string;
  resourceSlug: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  partySize: number | null;
  totalMinor: number;
  amountPaidMinor: number;
  source: string;
  checkedInAt: Date | null;
  notes: string | null;
}

/** The window a trading night covers, in absolute time. */
async function businessWindow(date: VenueDate): Promise<{ start: Date; end: Date }> {
  const { rows } = await pool().query<{ opens_at: string; closes_at: string; closes_next_day: boolean }>(
    `SELECT opens_at, closes_at, closes_next_day FROM operating_hours
      WHERE day_of_week = EXTRACT(DOW FROM $1::date)::int`,
    [date],
  );

  if (rows.length === 0) {
    // No configured hours: fall back to the calendar day so the dashboard still shows
    // something rather than silently going blank.
    return { start: venueDateToInstant(date), end: venueDateToInstant(addVenueDays(date, 1)) };
  }

  const [openHour, openMinute] = rows[0].opens_at.split(":").map(Number);
  const [closeHour, closeMinute] = rows[0].closes_at.split(":").map(Number);
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute + (rows[0].closes_next_day ? 1440 : 0);

  return {
    start: venueDateToInstant(date, openMinutes),
    end: venueDateToInstant(date, closeMinutes),
  };
}

/** Every booking on one trading night, across both courts. */
export async function getDaySchedule(date: VenueDate): Promise<ScheduleEntry[]> {
  const { start, end } = await businessWindow(date);

  const { rows } = await pool().query(
    `SELECT b.id, b.reference, b.starts_at, b.ends_at, b.status, b.payment_status,
            b.customer_name, b.customer_phone, b.party_size, b.total_minor,
            b.amount_paid_minor, b.source, b.checked_in_at, b.notes, b.approval_note,
            s.name AS sport_name, s.slug AS sport_slug,
            r.name AS resource_name, r.slug AS resource_slug
       FROM bookings b
       JOIN sports s ON s.id = b.sport_id
       JOIN resources r ON r.id = b.resource_id
      WHERE b.starts_at >= $1 AND b.starts_at < $2
        AND b.status <> 'cancelled'
      ORDER BY r.sort_order, b.starts_at`,
    [start.toISOString(), end.toISOString()],
  );

  return rows.map(toScheduleEntry);
}

/** Maintenance and blackouts on a night, so the calendar shows why a court is dark. */
export async function getDayClosures(date: VenueDate) {
  const { start, end } = await businessWindow(date);

  const { rows } = await pool().query(
    `SELECT m.id, m.reason, m.starts_at, m.ends_at, r.name AS resource_name, r.slug AS resource_slug,
            'maintenance' AS kind
       FROM maintenance_blocks m JOIN resources r ON r.id = m.resource_id
      WHERE m.starts_at < $2 AND m.ends_at > $1
      UNION ALL
     SELECT bp.id, bp.label, bp.starts_at, bp.ends_at,
            COALESCE(r.name, 'Whole venue'), COALESCE(r.slug, 'venue'), 'blackout'
       FROM blackout_periods bp LEFT JOIN resources r ON r.id = bp.resource_id
      WHERE bp.starts_at < $2 AND bp.ends_at > $1
      ORDER BY starts_at`,
    [start.toISOString(), end.toISOString()],
  );

  return rows.map((row) => ({
    id: row.id as string,
    reason: row.reason as string,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    resourceName: row.resource_name as string,
    resourceSlug: row.resource_slug as string,
    kind: row.kind as "maintenance" | "blackout",
  }));
}

export interface DashboardCounts {
  bookingsTonight: number;
  confirmedTonight: number;
  /** Requests nobody has decided on yet. */
  awaitingApproval: number;
  /** JazzCash transaction references waiting to be checked. */
  proofsToCheck: number;
  paymentsToVerify: number;
  tableRequestsPending: number;
  newInquiries: number;
  /** Money actually collected tonight. */
  collectedTonightMinor: number;
  /** Booked but not yet paid. Expected, not earned. */
  outstandingTonightMinor: number;
}

export async function getDashboardCounts(date: VenueDate): Promise<DashboardCounts> {
  const { start, end } = await businessWindow(date);

  const { rows } = await pool().query(
    `SELECT
       (SELECT count(*) FROM bookings
         WHERE starts_at >= $1 AND starts_at < $2 AND status <> 'cancelled') AS bookings_tonight,
       (SELECT count(*) FROM bookings
         WHERE starts_at >= $1 AND starts_at < $2 AND status = 'confirmed') AS confirmed_tonight,
       (SELECT count(*) FROM bookings
         WHERE status = 'pending_approval' AND slot_approved_at IS NULL) AS awaiting_approval,
       (SELECT count(*) FROM payment_proofs WHERE status = 'submitted') AS proofs_to_check,
       (SELECT count(*) FROM payment_intents WHERE status = 'awaiting_verification') AS payments_to_verify,
       (SELECT count(*) FROM cafe_reservations WHERE status = 'requested') AS table_requests,
       (SELECT count(*) FROM inquiries WHERE status = 'new') AS new_inquiries,
       -- Collected: only what a payment record says was actually captured.
       (SELECT COALESCE(sum(b.amount_paid_minor), 0) FROM bookings b
         WHERE b.starts_at >= $1 AND b.starts_at < $2 AND b.status <> 'cancelled') AS collected,
       -- Outstanding: the rest of what is owed on tonight's confirmed bookings.
       (SELECT COALESCE(sum(b.total_minor - b.amount_paid_minor), 0) FROM bookings b
         WHERE b.starts_at >= $1 AND b.starts_at < $2 AND b.status IN ('confirmed','pending_approval')) AS outstanding`,
    [start.toISOString(), end.toISOString()],
  );

  const row = rows[0];
  return {
    bookingsTonight: Number(row.bookings_tonight),
    confirmedTonight: Number(row.confirmed_tonight),
    awaitingApproval: Number(row.awaiting_approval),
    proofsToCheck: Number(row.proofs_to_check),
    paymentsToVerify: Number(row.payments_to_verify),
    tableRequestsPending: Number(row.table_requests),
    newInquiries: Number(row.new_inquiries),
    collectedTonightMinor: Number(row.collected),
    outstandingTonightMinor: Number(row.outstanding),
  };
}

/** Booking search, for the front desk looking someone up. */
export async function searchBookings(options: {
  query?: string;
  status?: string;
  sportSlug?: string;
  from?: VenueDate;
  to?: VenueDate;
  limit?: number;
}): Promise<ScheduleEntry[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options.query) {
    values.push(`%${options.query.trim()}%`);
    const index = values.length;
    // Reference, name or phone — whichever the customer can remember.
    conditions.push(
      `(b.reference ILIKE $${index} OR b.customer_name ILIKE $${index} OR b.customer_phone ILIKE $${index})`,
    );
  }
  if (options.status) {
    values.push(options.status);
    conditions.push(`b.status::text = $${values.length}`);
  }
  if (options.sportSlug) {
    values.push(options.sportSlug);
    conditions.push(`s.slug = $${values.length}`);
  }
  if (options.from) {
    values.push(venueDateToInstant(options.from).toISOString());
    conditions.push(`b.starts_at >= $${values.length}`);
  }
  if (options.to) {
    values.push(venueDateToInstant(addVenueDays(options.to, 1)).toISOString());
    conditions.push(`b.starts_at < $${values.length}`);
  }

  values.push(options.limit ?? 100);

  const { rows } = await pool().query(
    `SELECT b.id, b.reference, b.starts_at, b.ends_at, b.status, b.payment_status,
            b.customer_name, b.customer_phone, b.party_size, b.total_minor,
            b.amount_paid_minor, b.source, b.checked_in_at, b.notes, b.approval_note,
            s.name AS sport_name, s.slug AS sport_slug,
            r.name AS resource_name, r.slug AS resource_slug
       FROM bookings b
       JOIN sports s ON s.id = b.sport_id
       JOIN resources r ON r.id = b.resource_id
      ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY b.starts_at DESC
      LIMIT $${values.length}`,
    values,
  );

  return rows.map(toScheduleEntry);
}

/**
 * Booking requests waiting on a staff decision.
 *
 * Oldest first: whoever has been waiting longest should hear back first.
 */
export async function getPendingRequests(limit = 100) {
  const { rows } = await pool().query(
    `SELECT b.id, b.reference, b.starts_at, b.ends_at, b.customer_name, b.customer_phone,
            b.customer_email, b.party_size, b.notes, b.total_minor, b.payment_preference,
            b.created_at, s.name AS sport_name, r.name AS resource_name
       FROM bookings b
       JOIN sports s ON s.id = b.sport_id
       JOIN resources r ON r.id = b.resource_id
      WHERE b.status = 'pending_approval' AND b.slot_approved_at IS NULL
      ORDER BY b.created_at ASC
      LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id as string,
    reference: row.reference as string,
    sportName: row.sport_name as string,
    resourceName: row.resource_name as string,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    customerEmail: row.customer_email as string | null,
    partySize: row.party_size as number | null,
    notes: row.notes as string | null,
    totalMinor: row.total_minor as number,
    paymentPreference: row.payment_preference as "at_venue" | "online",
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/** Payments a member of staff still has to look at. */
export async function getPaymentsAwaitingVerification() {
  const { rows } = await pool().query(
    `SELECT pi.id, pi.provider, pi.amount_minor, pi.receipt_url, pi.receipt_note, pi.created_at,
            b.reference, b.customer_name, b.customer_phone, b.starts_at, s.name AS sport_name
       FROM payment_intents pi
       JOIN bookings b ON b.id = pi.booking_id
       JOIN sports s ON s.id = b.sport_id
      WHERE pi.status = 'awaiting_verification'
      ORDER BY pi.created_at ASC`,
  );
  return rows.map((row) => ({
    intentId: row.id as string,
    provider: row.provider as string,
    amountMinor: row.amount_minor as number,
    receiptUrl: row.receipt_url as string | null,
    receiptNote: row.receipt_note as string | null,
    reference: row.reference as string,
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    startsAt: new Date(row.starts_at),
    sportName: row.sport_name as string,
    createdAt: new Date(row.created_at),
  }));
}

function toScheduleEntry(row: Record<string, unknown>): ScheduleEntry {
  return {
    id: row.id as string,
    reference: row.reference as string,
    sportName: row.sport_name as string,
    sportSlug: row.sport_slug as string,
    resourceName: row.resource_name as string,
    resourceSlug: row.resource_slug as string,
    startsAt: new Date(row.starts_at as string),
    endsAt: new Date(row.ends_at as string),
    status: row.status as BookingStatus,
    paymentStatus: row.payment_status as PaymentStatus,
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    partySize: row.party_size as number | null,
    totalMinor: row.total_minor as number,
    amountPaidMinor: row.amount_paid_minor as number,
    source: row.source as string,
    checkedInAt: row.checked_in_at ? new Date(row.checked_in_at as string) : null,
    notes: row.notes as string | null,
    approvalNote: row.approval_note as string | null,
  };
}

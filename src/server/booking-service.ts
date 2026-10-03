import type { PoolClient } from "pg";
import {
  isCourtConflict,
  lockResource,
  pool,
  withTransaction,
} from "@/lib/db/client";
import {
  computeDayAvailability,
  overlaps,
  type BookingPolicy,
  type DayAvailability,
  type OccupiedInterval,
  type OpeningHours,
  type ResourceConfig,
  type SportConfig,
} from "@/lib/domain/availability";
import {
  quoteBooking,
  type AddonSelection,
  type CouponDefinition,
  type PriceBreakdown,
  type PricingRule,
} from "@/lib/domain/pricing";
import {
  canTransitionBooking,
  isCustomerManageable,
  type Actor,
  type BookingStatus,
} from "@/lib/domain/booking-state";
import {
  generateAccessToken,
  generateBookingReference,
  notificationDedupeKey,
} from "@/lib/domain/reference";
import {
  addVenueDays,
  formatVenueDateTimeShort,
  parseLocalTime,
  venueDateToInstant,
  venueDayOfWeek,
  type VenueDate,
} from "@/lib/domain/time";
import { normalisePakistaniPhone } from "@/lib/domain/phone";
import { serverEnv } from "@/lib/env";

/**
 * Booking service.
 *
 * Everything that can create or move a court reservation goes through here, and every
 * path obeys the same three rules:
 *
 *   1. Price is recomputed on the server. Nothing the client says about money is used.
 *   2. Availability is re-checked inside the write transaction, under a per-court
 *      advisory lock, not trusted from the page the customer was looking at.
 *   3. The exclusion constraint is the last line of defence. When it fires we return
 *      "someone just took it" rather than treating it as a server fault, because that
 *      is exactly what happened.
 */

export interface BookingDefaults {
  /**
   * How long a submitted request keeps its slot while nobody has decided on it. This is a
   * backstop, not the normal path -- requests are meant to be released by staff approving
   * or declining them. It exists so a request nobody ever looked at cannot block a court
   * for ever.
   */
  requestHoldHours: number;
  holdMinutes: number;
  leadTimeMinutes: number;
  bookingHorizonDays: number;
  /** Hours before the start a customer may still cancel. */
  cancellationCutoffHours: number;
  /** Hours before the start a customer may still reschedule. */
  rescheduleCutoffHours: number;
  /** Does an online booking need staff approval before it counts as confirmed? */
  requiresApproval: boolean;
}

export const DEFAULT_BOOKING_DEFAULTS: BookingDefaults = {
  requestHoldHours: 48,
  holdMinutes: 15,
  leadTimeMinutes: 60,
  bookingHorizonDays: 30,
  cancellationCutoffHours: 12,
  rescheduleCutoffHours: 12,
  requiresApproval: false,
};

export class BookingError extends Error {
  readonly code:
    | "slot_taken"
    | "slot_unavailable"
    | "sport_unavailable"
    | "invalid_duration"
    | "price_changed"
    | "not_found"
    | "not_permitted"
    | "too_late"
    | "hold_expired";
  readonly detail?: string;

  constructor(code: BookingError["code"], message: string, detail?: string) {
    super(message);
    this.name = "BookingError";
    this.code = code;
    this.detail = detail;
  }
}

// --- Configuration reads -------------------------------------------------------------

export interface SportWithResource {
  sport: SportConfig & { defaultDuration: number; isActive: boolean };
  resource: ResourceConfig & { slug: string; name: string; isActive: boolean };
}

export async function loadSportBySlug(
  slug: string,
  client?: PoolClient,
): Promise<SportWithResource | null> {
  const runner = client ?? pool();
  const { rows } = await runner.query(
    `SELECT s.id, s.slug, s.name, s.resource_id, s.slot_step_minutes, s.allowed_durations,
            s.default_duration, s.is_active,
            r.slug AS resource_slug, r.name AS resource_name, r.turnaround_minutes,
            r.sport_change_buffer_minutes, r.is_active AS resource_active
     FROM sports s JOIN resources r ON r.id = s.resource_id
     WHERE s.slug = $1`,
    [slug],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    sport: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      resourceId: row.resource_id,
      slotStepMinutes: row.slot_step_minutes,
      allowedDurations: row.allowed_durations,
      defaultDuration: row.default_duration,
      isActive: row.is_active,
    },
    resource: {
      id: row.resource_id,
      slug: row.resource_slug,
      name: row.resource_name,
      turnaroundMinutes: row.turnaround_minutes,
      sportChangeBufferMinutes: row.sport_change_buffer_minutes,
      isActive: row.resource_active,
    },
  };
}

/** Sports the public site may show. Anything inactive is invisible, not greyed out. */
export async function loadActiveSports(): Promise<SportWithResource[]> {
  const { rows } = await pool().query(
    `SELECT s.slug FROM sports s JOIN resources r ON r.id = s.resource_id
     WHERE s.is_active AND r.is_active ORDER BY s.sort_order, s.name`,
  );
  const loaded = await Promise.all(rows.map((row) => loadSportBySlug(row.slug)));
  return loaded.filter((entry): entry is SportWithResource => entry !== null);
}

export async function loadOpeningHours(
  date: VenueDate,
  client?: PoolClient,
): Promise<OpeningHours> {
  const runner = client ?? pool();
  const { rows } = await runner.query(
    "SELECT opens_at, closes_at, closes_next_day, is_closed FROM operating_hours WHERE day_of_week = $1",
    [venueDayOfWeek(date)],
  );
  if (rows.length === 0) {
    // No row configured for this weekday means the venue has not said it opens. Closed
    // is the safe reading: better to show nothing than to sell an hour nobody is here for.
    return { opensAtMinute: 0, closesAtMinute: 0, closesNextDay: false, isClosed: true };
  }
  const row = rows[0];
  return {
    opensAtMinute: parseLocalTime(row.opens_at),
    closesAtMinute: parseLocalTime(row.closes_at),
    closesNextDay: row.closes_next_day,
    isClosed: row.is_closed,
  };
}

export async function loadBookingDefaults(client?: PoolClient): Promise<BookingDefaults> {
  const runner = client ?? pool();
  const { rows } = await runner.query("SELECT key, value FROM settings WHERE key LIKE 'booking.%'");
  const map = new Map<string, unknown>(rows.map((row) => [row.key, row.value]));
  const num = (key: string, fallback: number): number => {
    const value = map.get(`booking.${key}`);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const value = map.get(`booking.${key}`);
    return typeof value === "boolean" ? value : fallback;
  };
  return {
    requestHoldHours: num("requestHoldHours", DEFAULT_BOOKING_DEFAULTS.requestHoldHours),
    holdMinutes: num("holdMinutes", DEFAULT_BOOKING_DEFAULTS.holdMinutes),
    leadTimeMinutes: num("leadTimeMinutes", DEFAULT_BOOKING_DEFAULTS.leadTimeMinutes),
    bookingHorizonDays: num("bookingHorizonDays", DEFAULT_BOOKING_DEFAULTS.bookingHorizonDays),
    cancellationCutoffHours: num(
      "cancellationCutoffHours",
      DEFAULT_BOOKING_DEFAULTS.cancellationCutoffHours,
    ),
    rescheduleCutoffHours: num(
      "rescheduleCutoffHours",
      DEFAULT_BOOKING_DEFAULTS.rescheduleCutoffHours,
    ),
    requiresApproval: bool("requiresApproval", DEFAULT_BOOKING_DEFAULTS.requiresApproval),
  };
}

export async function loadPricingRules(
  sportId: string,
  client?: PoolClient,
): Promise<PricingRule[]> {
  const runner = client ?? pool();
  const { rows } = await runner.query(
    `SELECT id, label, sport_id, resource_id, days_of_week, starts_at_local, ends_at_local,
            rate_minor_per_hour, is_peak, priority, valid_from, valid_to
     FROM pricing_rules
     WHERE is_active AND (sport_id IS NULL OR sport_id = $1)
     ORDER BY priority DESC`,
    [sportId],
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    sportId: row.sport_id,
    resourceId: row.resource_id,
    daysOfWeek: row.days_of_week,
    startsAtMinute: parseLocalTime(row.starts_at_local),
    endsAtMinute: parseLocalTime(row.ends_at_local),
    rateMinorPerHour: row.rate_minor_per_hour,
    isPeak: row.is_peak,
    priority: row.priority,
    validFrom: row.valid_from ? String(row.valid_from).slice(0, 10) : null,
    validTo: row.valid_to ? String(row.valid_to).slice(0, 10) : null,
  }));
}

// --- Occupancy reads ----------------------------------------------------------------

/**
 * Blocking reservations on one court that touch a window.
 *
 * Expired holds are excluded here as well as swept, because a read may happen between
 * a hold expiring and the sweeper noticing. Availability should not show a slot as
 * taken by a hold that is already dead.
 */
export async function loadOccupied(
  resourceId: string,
  from: Date,
  to: Date,
  client?: PoolClient,
): Promise<OccupiedInterval[]> {
  const runner = client ?? pool();
  const { rows } = await runner.query(
    `SELECT kind, sport_id, lower(during) AS starts_at, upper(during) AS ends_at
     FROM reservations
     WHERE resource_id = $1
       AND blocks_availability
       -- An expired checkout hold is dead but may not have been swept yet. A request's
       -- expiry is only a backstop, so requests are shown until staff decide or it lapses.
       AND (kind NOT IN ('hold', 'request') OR expires_at IS NULL OR expires_at > now())
       AND during && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    [resourceId, from.toISOString(), to.toISOString()],
  );
  return rows.map((row) => ({
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    kind: row.kind,
    sportId: row.sport_id,
  }));
}

export async function loadBlackouts(
  resourceId: string,
  from: Date,
  to: Date,
  client?: PoolClient,
): Promise<{ startsAt: Date; endsAt: Date }[]> {
  const runner = client ?? pool();
  const { rows } = await runner.query(
    `SELECT starts_at, ends_at FROM blackout_periods
     WHERE (resource_id IS NULL OR resource_id = $1)
       AND starts_at < $3::timestamptz AND ends_at > $2::timestamptz`,
    [resourceId, from.toISOString(), to.toISOString()],
  );
  return rows.map((row) => ({ startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at) }));
}

// --- Hold sweeping -------------------------------------------------------------------

export interface SweepResult {
  releasedHolds: number;
  cancelledBookings: string[];
}

/**
 * Release holds whose expiry has passed.
 *
 * An expired hold still satisfies the exclusion constraint -- a constraint predicate
 * cannot call now() -- so nothing frees the court until this runs. It is called from
 * three places: before every availability read, at the start of every booking write,
 * and from a cron route, so a slot cannot stay falsely blocked because no customer
 * happened to look at it.
 *
 * `FOR UPDATE SKIP LOCKED` keeps two concurrent sweepers from deadlocking on the same
 * rows: whoever gets there first handles them, the other moves on.
 */
export async function sweepExpiredHolds(client?: PoolClient): Promise<SweepResult> {
  const runner = client ?? pool();
  const { rows } = await runner.query(
    `WITH expired AS (
       SELECT id, booking_id FROM reservations
       WHERE kind IN ('hold', 'request')
         AND blocks_availability
         AND expires_at IS NOT NULL
         AND expires_at < now()
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 500
     ),
     released AS (
       UPDATE reservations r SET blocks_availability = false
       FROM expired e WHERE r.id = e.id
       RETURNING r.booking_id
     )
     UPDATE bookings b
        SET status = 'cancelled',
            cancelled_at = now(),
            cancelled_by = 'system',
            cancellation_reason = CASE
              WHEN b.status = 'held' THEN 'Checkout was not completed in time.'
              ELSE 'The request expired before anyone at the venue could decide on it.'
            END
      WHERE b.id IN (SELECT booking_id FROM released WHERE booking_id IS NOT NULL)
        AND b.status IN ('held', 'pending_approval')
      RETURNING b.reference`,
  );
  return {
    releasedHolds: rows.length,
    cancelledBookings: rows.map((row) => row.reference),
  };
}

// --- Availability (read path) --------------------------------------------------------

export interface AvailabilityRequest {
  date: VenueDate;
  sportSlug: string;
  durationMinutes?: number;
  now?: Date;
}

export async function getDayAvailability(
  request: AvailabilityRequest,
): Promise<DayAvailability & { sportName: string; resourceName: string; durations: number[] }> {
  // Do this first, or a slot freed a second ago still shows as taken.
  await sweepExpiredHolds();

  const loaded = await loadSportBySlug(request.sportSlug);
  if (!loaded) throw new BookingError("not_found", "That sport is not available here.");
  const { sport, resource } = loaded;
  if (!sport.isActive || !resource.isActive) {
    throw new BookingError("sport_unavailable", `${sport.name} is not currently bookable.`);
  }

  const durationMinutes = request.durationMinutes ?? sport.defaultDuration;
  if (!sport.allowedDurations.includes(durationMinutes)) {
    throw new BookingError(
      "invalid_duration",
      `${sport.name} is booked in ${sport.allowedDurations.join(", ")} minute sessions.`,
    );
  }

  const [hours, defaults] = await Promise.all([
    loadOpeningHours(request.date),
    loadBookingDefaults(),
  ]);

  // Widen the occupancy read by a day either side: a session starting at 01:00 belongs
  // to the previous business day, and turnaround can push a blocking window past close.
  const from = venueDateToInstant(addVenueDays(request.date, -1));
  const to = venueDateToInstant(addVenueDays(request.date, 2));

  const [occupied, blackouts] = await Promise.all([
    loadOccupied(resource.id, from, to),
    loadBlackouts(resource.id, from, to),
  ]);

  const policy: BookingPolicy = {
    leadTimeMinutes: defaults.leadTimeMinutes,
    bookingHorizonDays: defaults.bookingHorizonDays,
  };

  const availability = computeDayAvailability({
    date: request.date,
    sport,
    resource,
    hours,
    durationMinutes,
    occupied,
    blackouts,
    policy,
    now: request.now ?? new Date(),
  });

  return {
    ...availability,
    sportName: sport.name,
    resourceName: resource.name,
    durations: [...sport.allowedDurations],
  };
}

// --- Quoting -------------------------------------------------------------------------

async function loadCoupon(
  code: string | null | undefined,
  client?: PoolClient,
): Promise<CouponDefinition | null> {
  if (!code) return null;
  const runner = client ?? pool();
  const { rows } = await runner.query(
    `SELECT id, code, kind, discount_bps, discount_minor, min_subtotal_minor, sport_ids,
            max_redemptions, redemption_count
     FROM coupons
     WHERE upper(code) = upper($1) AND is_active
       AND (valid_from IS NULL OR valid_from <= now())
       AND (valid_to IS NULL OR valid_to >= now())`,
    [code],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  // An exhausted coupon is treated as non-existent, so the customer is told the code is
  // not valid rather than being shown a discount that will be stripped at checkout.
  if (row.max_redemptions !== null && row.redemption_count >= row.max_redemptions) return null;
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    discountBps: row.discount_bps,
    discountMinor: row.discount_minor,
    minSubtotalMinor: row.min_subtotal_minor,
    sportIds: row.sport_ids,
  };
}

async function loadAddonSelections(
  requested: readonly { addonId: string; quantity: number }[],
  sportId: string,
  client?: PoolClient,
): Promise<AddonSelection[]> {
  if (requested.length === 0) return [];
  const runner = client ?? pool();
  const ids = requested.map((entry) => entry.addonId);
  const { rows } = await runner.query(
    `SELECT id, name, price_minor, max_per_booking, stock_quantity, sport_ids
     FROM addons WHERE id = ANY($1::uuid[]) AND is_active`,
    [ids],
  );
  const byId = new Map(rows.map((row) => [row.id, row]));

  return requested.map((entry) => {
    const row = byId.get(entry.addonId);
    if (!row) throw new BookingError("slot_unavailable", "One of the extras is no longer offered.");
    if (row.sport_ids.length > 0 && !row.sport_ids.includes(sportId)) {
      throw new BookingError("slot_unavailable", `${row.name} is not available for this sport.`);
    }
    if (entry.quantity < 1 || entry.quantity > row.max_per_booking) {
      throw new BookingError(
        "slot_unavailable",
        `You can add up to ${row.max_per_booking} × ${row.name}.`,
      );
    }
    if (row.stock_quantity !== null && entry.quantity > row.stock_quantity) {
      throw new BookingError("slot_unavailable", `Only ${row.stock_quantity} × ${row.name} left.`);
    }
    // Price comes from this row, never from the request.
    return {
      addonId: row.id,
      name: row.name,
      unitPriceMinor: row.price_minor,
      quantity: entry.quantity,
    };
  });
}

export interface QuoteRequest {
  sportSlug: string;
  startsAt: Date;
  durationMinutes: number;
  addons?: readonly { addonId: string; quantity: number }[];
  couponCode?: string | null;
}

/** Server-side quote. The browser displays this; it never computes its own. */
export async function quote(
  request: QuoteRequest,
  client?: PoolClient,
): Promise<PriceBreakdown & { sportName: string }> {
  const loaded = await loadSportBySlug(request.sportSlug, client);
  if (!loaded) throw new BookingError("not_found", "That sport is not available here.");
  const { sport, resource } = loaded;

  if (!sport.allowedDurations.includes(request.durationMinutes)) {
    throw new BookingError("invalid_duration", "That session length is not offered.");
  }

  const [rules, addons, coupon] = await Promise.all([
    loadPricingRules(sport.id, client),
    loadAddonSelections(request.addons ?? [], sport.id, client),
    loadCoupon(request.couponCode, client),
  ]);

  const breakdown = quoteBooking({
    sportId: sport.id,
    resourceId: resource.id,
    startsAt: request.startsAt,
    endsAt: new Date(request.startsAt.getTime() + request.durationMinutes * 60_000),
    rules,
    addons,
    coupon,
  });

  return { ...breakdown, sportName: sport.name };
}

// --- Write path ----------------------------------------------------------------------

export interface CreateBookingRequestInput {
  sportSlug: string;
  startsAt: Date;
  durationMinutes: number;
  customer: { name: string; phone: string; email?: string | null };
  partySize?: number | null;
  notes?: string | null;
  addons?: readonly { addonId: string; quantity: number }[];
  couponCode?: string | null;
  customerId?: string | null;
  /** What the customer was shown. If the server disagrees, the booking is refused. */
  expectedTotalMinor?: number | null;
  /** How they would like to pay. Online payers are sent a link once staff approve. */
  paymentPreference?: "at_venue" | "online";
}

export interface SubmittedBookingRequest {
  bookingId: string;
  reference: string;
  /** Plaintext, returned once. Only its hash is stored. */
  accessToken: string;
  /** Backstop expiry. Normally the request is released by a staff decision, not this. */
  expiresAt: Date;
  startsAt: Date;
  endsAt: Date;
  sportName: string;
  resourceName: string;
  price: PriceBreakdown;
  paymentPreference: "at_venue" | "online";
}

/**
 * Submit a booking request.
 *
 * Nothing is confirmed here. The customer is asking for a slot; a member of staff decides,
 * because they know about walk-ins and phone bookings that never reached this system.
 *
 * The request DOES take the court off the board immediately, which is what stops two
 * customers requesting the same slot and stops staff approving two overlapping requests.
 * It is released by a staff decision, not a timer.
 *
 * The concurrency guarantees are unchanged from any other write here:
 *   - the court is locked for the rest of the transaction, so the availability re-check
 *     below cannot be invalidated by a competing writer between read and insert;
 *   - the price is recomputed from the database and compared against what the customer was
 *     shown, so a tampered form cannot buy an hour cheaply;
 *   - the exclusion constraint still guards the insert, and a violation is reported as
 *     "just taken" rather than as a failure.
 */
export async function createBookingRequest(
  request: CreateBookingRequestInput,
): Promise<SubmittedBookingRequest> {
  const phone = normalisePakistaniPhone(request.customer.phone);
  const name = request.customer.name.trim();
  if (name.length < 2) {
    throw new BookingError("slot_unavailable", "Please tell us who the booking is for.");
  }

  await sweepExpiredHolds();

  return withTransaction(async (client) => {
    const loaded = await loadSportBySlug(request.sportSlug, client);
    if (!loaded) throw new BookingError("not_found", "That sport is not available here.");
    const { sport, resource } = loaded;
    if (!sport.isActive || !resource.isActive) {
      throw new BookingError("sport_unavailable", `${sport.name} is not currently bookable.`);
    }
    if (!sport.allowedDurations.includes(request.durationMinutes)) {
      throw new BookingError("invalid_duration", "That session length is not offered.");
    }

    // Serialise every write on this court from here to commit.
    await lockResource(client, resource.id);

    const defaults = await loadBookingDefaults(client);
    const endsAt = new Date(request.startsAt.getTime() + request.durationMinutes * 60_000);

    await assertSlotBookable({
      client,
      sport,
      resource,
      startsAt: request.startsAt,
      endsAt,
      policy: {
        leadTimeMinutes: defaults.leadTimeMinutes,
        bookingHorizonDays: defaults.bookingHorizonDays,
      },
      now: new Date(),
    });

    const [rules, addons, coupon] = await Promise.all([
      loadPricingRules(sport.id, client),
      loadAddonSelections(request.addons ?? [], sport.id, client),
      loadCoupon(request.couponCode, client),
    ]);

    const price = quoteBooking({
      sportId: sport.id,
      resourceId: resource.id,
      startsAt: request.startsAt,
      endsAt,
      rules,
      addons,
      coupon,
    });

    // If the rate table changed while the customer was filling in the form, stop and
    // make them look at the new number rather than silently charging it.
    if (
      typeof request.expectedTotalMinor === "number" &&
      request.expectedTotalMinor !== price.totalMinor
    ) {
      throw new BookingError(
        "price_changed",
        "The price for this slot changed while you were booking. Please review the new total.",
        JSON.stringify({ expected: request.expectedTotalMinor, actual: price.totalMinor }),
      );
    }

    const reference = generateBookingReference();
    const { token, hash } = generateAccessToken();
    const paymentPreference = request.paymentPreference ?? "at_venue";

    // Backstop only. The request is normally released by staff approving or declining it;
    // this stops one nobody ever looked at from blocking the court indefinitely, and it
    // never outlives the session it is for.
    const backstop = new Date(Date.now() + defaults.requestHoldHours * 3_600_000);
    const expiresAt = backstop < request.startsAt ? backstop : request.startsAt;

    const policySnapshot = {
      cancellationCutoffHours: defaults.cancellationCutoffHours,
      rescheduleCutoffHours: defaults.rescheduleCutoffHours,
      requiresApproval: true,
      paymentPreference,
      capturedAt: new Date().toISOString(),
    };

    const { rows: bookingRows } = await client.query(
      `INSERT INTO bookings (
         reference, access_token_hash, sport_id, resource_id, starts_at, ends_at,
         duration_minutes, status, payment_status, customer_id, customer_name,
         customer_phone, customer_email, party_size, notes, source, currency,
         subtotal_minor, discount_minor, total_minor, pricing_snapshot, policy_snapshot,
         coupon_code, hold_expires_at, payment_preference
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,'pending_approval','unpaid',$8,$9,$10,$11,$12,$13,'online',$14,
         $15,$16,$17,$18,$19,$20,$21,$22
       ) RETURNING id`,
      [
        reference,
        hash,
        sport.id,
        resource.id,
        request.startsAt.toISOString(),
        endsAt.toISOString(),
        request.durationMinutes,
        request.customerId ?? null,
        name,
        phone.e164,
        request.customer.email?.trim() || null,
        request.partySize ?? null,
        request.notes?.trim() || null,
        price.currency,
        price.subtotalMinor,
        price.discountMinor,
        price.totalMinor,
        JSON.stringify(price),
        JSON.stringify(policySnapshot),
        price.couponCode,
        expiresAt.toISOString(),
        paymentPreference,
      ],
    );
    const bookingId: string = bookingRows[0].id;

    for (const addon of price.addons) {
      await client.query(
        `INSERT INTO booking_addons (booking_id, addon_id, name, unit_price_minor, quantity, line_total_minor)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [bookingId, addon.addonId, addon.name, addon.unitPriceMinor, addon.quantity, addon.lineTotalMinor],
      );
    }

    await insertReservation(client, {
      resourceId: resource.id,
      sportId: sport.id,
      kind: "request",
      startsAt: request.startsAt,
      // The blocking window includes changeover, so the next customer is not offered a
      // slot the court will not actually be ready for.
      endsAt: new Date(endsAt.getTime() + resource.turnaroundMinutes * 60_000),
      bookingId,
      expiresAt,
    });

    // Both halves queued in the same transaction as the booking: the customer's receipt
    // and the venue's alert. A mail outage delays them; it cannot lose the request.
    await queueBookingNotification(client, {
      bookingId,
      reference,
      template: "request_received",
      recipientEmail: request.customer.email?.trim() || null,
      recipientPhone: phone.e164,
      payload: {
        name,
        sport: sport.name,
        when: formatVenueDateTimeShort(request.startsAt),
        reference,
        totalMinor: price.totalMinor,
        paymentPreference,
      },
    });

    await queueVenueNotification(client, {
      bookingId,
      template: "request_received_venue",
      payload: {
        reference,
        name,
        phone: phone.e164,
        email: request.customer.email?.trim() ?? null,
        sport: sport.name,
        court: resource.name,
        when: formatVenueDateTimeShort(request.startsAt),
        durationMinutes: request.durationMinutes,
        totalMinor: price.totalMinor,
        paymentPreference,
        notes: request.notes?.trim() ?? null,
      },
    });

    await audit(client, {
      actorType: "customer",
      action: "booking.requested",
      entityType: "booking",
      entityId: bookingId,
      diff: {
        reference,
        sport: sport.slug,
        startsAt: request.startsAt.toISOString(),
        paymentPreference,
      },
    });

    return {
      bookingId,
      reference,
      accessToken: token,
      expiresAt,
      startsAt: request.startsAt,
      endsAt,
      sportName: sport.name,
      resourceName: resource.name,
      price,
      paymentPreference,
    };
  });
}

/**
 * Re-check, inside the transaction, that a specific slot is genuinely bookable.
 *
 * This repeats the work `computeDayAvailability` did for the page the customer saw. That
 * duplication is the point: the earlier answer was a display, this one is a decision,
 * and between the two an arbitrary amount of time and any number of other customers
 * have passed.
 */
async function assertSlotBookable(args: {
  client: PoolClient;
  sport: SportConfig;
  resource: ResourceConfig;
  startsAt: Date;
  endsAt: Date;
  policy: BookingPolicy;
  now: Date;
  /** Set when rescheduling, so the booking does not block itself. */
  ignoreBookingId?: string;
}): Promise<void> {
  const { client, sport, resource, startsAt, endsAt, policy, now } = args;

  if (startsAt.getTime() <= now.getTime()) {
    throw new BookingError("slot_unavailable", "That start time has already passed.");
  }
  if (startsAt.getTime() < now.getTime() + policy.leadTimeMinutes * 60_000) {
    throw new BookingError(
      "too_late",
      `Online bookings close ${policy.leadTimeMinutes} minutes before the start. Please call the venue.`,
    );
  }

  const blockEnd = new Date(endsAt.getTime() + resource.turnaroundMinutes * 60_000);

  // The session must sit inside opening hours. Checked against the business day the
  // start belongs to, so a 01:00 slot is validated against the night it belongs to.
  const businessDate = businessDateOfInstant(startsAt);
  const hours = await loadOpeningHours(businessDate, client);
  if (hours.isClosed) {
    throw new BookingError("slot_unavailable", "The venue is closed then.");
  }
  const openFrom = venueDateToInstant(businessDate, hours.opensAtMinute);
  const openTo = venueDateToInstant(
    businessDate,
    hours.closesNextDay ? hours.closesAtMinute + 1440 : hours.closesAtMinute,
  );
  if (startsAt < openFrom || endsAt > openTo) {
    throw new BookingError("slot_unavailable", "That time is outside opening hours.");
  }

  const blackouts = await loadBlackouts(resource.id, startsAt, blockEnd, client);
  if (blackouts.some((entry) => overlaps(startsAt, blockEnd, entry.startsAt, entry.endsAt))) {
    throw new BookingError("slot_unavailable", "The venue is closed then.");
  }

  // Read occupancy wide enough that the sport-change buffer can see its neighbours.
  const bufferMs = resource.sportChangeBufferMinutes * 60_000;
  const occupied = await loadOccupied(
    resource.id,
    new Date(startsAt.getTime() - bufferMs - 60_000),
    new Date(blockEnd.getTime() + bufferMs + 60_000),
    client,
  );

  const relevant = args.ignoreBookingId
    ? await excludeBookingIntervals(client, occupied, args.ignoreBookingId)
    : occupied;

  for (const interval of relevant) {
    if (overlaps(startsAt, blockEnd, interval.startsAt, interval.endsAt)) {
      if (interval.kind === "maintenance") {
        throw new BookingError("slot_unavailable", "That court is closed for maintenance then.");
      }
      if (interval.kind === "event") {
        throw new BookingError("slot_unavailable", "That court is reserved for an event then.");
      }
      throw new BookingError(
        "slot_taken",
        "Someone booked that slot a moment ago. Please pick another time.",
      );
    }
  }

  if (bufferMs > 0) {
    for (const interval of relevant) {
      if (interval.sportId === null || interval.sportId === sport.id) continue;
      const gapBefore = startsAt.getTime() - interval.endsAt.getTime();
      const gapAfter = interval.startsAt.getTime() - blockEnd.getTime();
      if ((gapBefore >= 0 && gapBefore < bufferMs) || (gapAfter >= 0 && gapAfter < bufferMs)) {
        throw new BookingError(
          "slot_unavailable",
          `The court needs ${resource.sportChangeBufferMinutes} minutes to change over between sports. Please pick a slightly later time.`,
        );
      }
    }
  }
}

/** Drop the intervals belonging to one booking, used when rescheduling it. */
async function excludeBookingIntervals(
  client: PoolClient,
  occupied: readonly OccupiedInterval[],
  bookingId: string,
): Promise<OccupiedInterval[]> {
  const { rows } = await client.query(
    "SELECT lower(during) AS starts_at, upper(during) AS ends_at FROM reservations WHERE booking_id = $1 AND blocks_availability",
    [bookingId],
  );
  const own = rows.map((row) => `${new Date(row.starts_at).getTime()}-${new Date(row.ends_at).getTime()}`);
  return occupied.filter(
    (interval) => !own.includes(`${interval.startsAt.getTime()}-${interval.endsAt.getTime()}`),
  );
}

async function insertReservation(
  client: PoolClient,
  args: {
    resourceId: string;
    sportId: string | null;
    kind: "booking" | "hold" | "request" | "maintenance" | "event";
    startsAt: Date;
    endsAt: Date;
    bookingId?: string;
    maintenanceId?: string;
    eventId?: string;
    expiresAt?: Date | null;
  },
): Promise<string> {
  try {
    const { rows } = await client.query(
      `INSERT INTO reservations (resource_id, sport_id, kind, during, booking_id,
                                maintenance_id, event_id, expires_at)
       VALUES ($1,$2,$3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6,$7,$8,$9)
       RETURNING id`,
      [
        args.resourceId,
        args.sportId,
        args.kind,
        args.startsAt.toISOString(),
        args.endsAt.toISOString(),
        args.bookingId ?? null,
        args.maintenanceId ?? null,
        args.eventId ?? null,
        args.expiresAt?.toISOString() ?? null,
      ],
    );
    return rows[0].id;
  } catch (error) {
    // The constraint fired, which means a competing transaction committed first. This is
    // an expected outcome of two people wanting the same court, not a server fault.
    if (isCourtConflict(error)) {
      throw new BookingError(
        "slot_taken",
        "Someone booked that slot a moment ago. Please pick another time.",
      );
    }
    throw error;
  }
}

// --- Cancellation --------------------------------------------------------------------

export interface CancelBookingRequest {
  bookingId: string;
  actor: Actor;
  staffId?: string | null;
  reason?: string | null;
  /** Staff may cancel inside the cutoff; customers may not. */
  overrideCutoff?: boolean;
}

export async function cancelBooking(request: CancelBookingRequest): Promise<{ reference: string }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT b.id, b.reference, b.status, b.starts_at, b.policy_snapshot, b.customer_email,
              b.customer_phone, b.customer_name, s.name AS sport_name
       FROM bookings b JOIN sports s ON s.id = b.sport_id
       WHERE b.id = $1 FOR UPDATE`,
      [request.bookingId],
    );
    if (rows.length === 0) throw new BookingError("not_found", "We could not find that booking.");
    const booking = rows[0];

    const allowed = canTransitionBooking(booking.status, "cancelled", request.actor);
    if (!allowed.ok) throw new BookingError("not_permitted", allowed.reason ?? "Not allowed.");

    // The policy that applied when the booking was made, not today's policy.
    const policy = (booking.policy_snapshot ?? {}) as { cancellationCutoffHours?: number };
    const cutoffHours = policy.cancellationCutoffHours ?? DEFAULT_BOOKING_DEFAULTS.cancellationCutoffHours;
    const cutoff = new Date(new Date(booking.starts_at).getTime() - cutoffHours * 3_600_000);

    if (request.actor === "customer" && !request.overrideCutoff && Date.now() > cutoff.getTime()) {
      throw new BookingError(
        "too_late",
        `This booking can no longer be cancelled online — that closed ${cutoffHours} hours before the start. Please call the venue.`,
      );
    }

    // Free the court. The row stays, so the history of what was booked survives.
    await client.query(
      "UPDATE reservations SET blocks_availability = false WHERE booking_id = $1",
      [request.bookingId],
    );

    await client.query(
      `UPDATE bookings
          SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
              cancellation_reason = $3, hold_expires_at = NULL
        WHERE id = $1`,
      [request.bookingId, request.actor, request.reason?.trim() || null],
    );

    await queueBookingNotification(client, {
      bookingId: booking.id,
      reference: booking.reference,
      template: "booking_cancelled",
      recipientEmail: booking.customer_email,
      recipientPhone: booking.customer_phone,
      payload: {
        name: booking.customer_name,
        sport: booking.sport_name,
        when: formatVenueDateTimeShort(new Date(booking.starts_at)),
        reference: booking.reference,
      },
    });

    await audit(client, {
      actorType: request.actor === "staff" ? "staff" : request.actor === "system" ? "system" : "customer",
      actorId: request.staffId ?? null,
      action: "booking.cancelled",
      entityType: "booking",
      entityId: booking.id,
      diff: { from: booking.status, reason: request.reason ?? null },
    });

    return { reference: booking.reference };
  });
}

// --- Staff decision on a request -------------------------------------------------------

export interface SlotDecisionRequest {
  bookingId: string;
  staffId: string;
  /**
   * On a decline this is the reason, and the customer sees it.
   *
   * On an approval it is the venue's own note about the confirmation call -- who was
   * spoken to, anything agreed. It is kept internal.
   */
  note?: string | null;
}

export interface SlotApprovalResult {
  reference: string;
  /** What the booking became. */
  status: BookingStatus;
  /** True when the customer must now pay before it is confirmed. */
  awaitingPayment: boolean;
  customerEmail: string | null;
}

/**
 * Approve the slot on a booking request.
 *
 * This is the point a member of staff confirms the court really is free -- having checked
 * the walk-ins and phone bookings the system never saw.
 *
 * What happens next depends on how the customer said they would pay:
 *
 *   - **At the venue:** the booking is CONFIRMED here and now. Money is collected on
 *     arrival, which is why booking status and payment status are separate fields.
 *   - **Online:** the booking stays `pending_approval` and a payment link goes out. It is
 *     confirmed only once a human has verified the transfer arrived. Approving the slot
 *     does not approve a payment that has not happened.
 */
export async function approveBookingSlot(
  request: SlotDecisionRequest,
): Promise<SlotApprovalResult> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT b.id, b.reference, b.status, b.starts_at, b.total_minor, b.payment_preference,
              b.customer_name, b.customer_phone, b.customer_email, b.slot_approved_at,
              s.name AS sport_name, r.name AS resource_name
         FROM bookings b
         JOIN sports s ON s.id = b.sport_id
         JOIN resources r ON r.id = b.resource_id
        WHERE b.id = $1 FOR UPDATE`,
      [request.bookingId],
    );
    if (rows.length === 0) throw new BookingError("not_found", "We could not find that request.");
    const booking = rows[0];

    if (booking.status === "cancelled") {
      throw new BookingError("not_permitted", "That request was already cancelled.");
    }
    if (booking.status === "confirmed") {
      // Idempotent: a double-click on Approve must not send a second email.
      return {
        reference: booking.reference,
        status: "confirmed" as BookingStatus,
        awaitingPayment: false,
        customerEmail: booking.customer_email,
      };
    }
    if (booking.status !== "pending_approval") {
      throw new BookingError(
        "not_permitted",
        `A ${booking.status.replace(/_/g, " ")} booking is not awaiting approval.`,
      );
    }

    const paysOnline = booking.payment_preference === "online";

    // Online payers get a single-purpose link to the payment page. Minted here because the
    // booking's own access token exists only as a hash by now, and kept separate so the
    // customer's original booking link is not invalidated.
    let payUrl: string | null = null;
    if (paysOnline) {
      const paymentToken = generateAccessToken();
      await client.query(
        "UPDATE bookings SET payment_token_hash = $2, payment_link_sent_at = now() WHERE id = $1",
        [request.bookingId, paymentToken.hash],
      );
      payUrl = `${serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/booking/${booking.reference}/pay?t=${encodeURIComponent(paymentToken.token)}`;
    }

    // The reservation stops being provisional and stops expiring: staff have decided the
    // court is theirs. For an online payer it still holds while they pay.
    await client.query(
      `UPDATE reservations
          SET kind = 'booking', expires_at = NULL
        WHERE booking_id = $1 AND blocks_availability`,
      [request.bookingId],
    );

    await client.query(
      `UPDATE bookings
          SET slot_approved_at = now(),
              slot_approved_by = $2,
              approval_note = $4,
              status = CASE WHEN $3::boolean THEN status ELSE 'confirmed'::booking_status END,
              hold_expires_at = NULL
        WHERE id = $1`,
      [request.bookingId, request.staffId, paysOnline, request.note?.trim() || null],
    );

    await queueBookingNotification(client, {
      bookingId: booking.id,
      reference: booking.reference,
      template: paysOnline ? "slot_approved_pay_now" : "booking_confirmed",
      recipientEmail: booking.customer_email,
      recipientPhone: booking.customer_phone,
      payload: {
        name: booking.customer_name,
        sport: booking.sport_name,
        court: booking.resource_name,
        when: formatVenueDateTimeShort(new Date(booking.starts_at)),
        reference: booking.reference,
        totalMinor: booking.total_minor,
        ...(payUrl ? { payUrl } : {}),
      },
    });

    await audit(client, {
      actorType: "staff",
      actorId: request.staffId,
      action: paysOnline ? "booking.slot_approved_awaiting_payment" : "booking.slot_approved",
      entityType: "booking",
      entityId: booking.id,
      diff: {
        reference: booking.reference,
        paymentPreference: booking.payment_preference,
        // What the venue recorded from the confirmation call.
        note: request.note?.trim() ?? null,
      },
    });

    return {
      reference: booking.reference,
      status: (paysOnline ? "pending_approval" : "confirmed") as BookingStatus,
      awaitingPayment: paysOnline,
      customerEmail: booking.customer_email,
    };
  });
}

/**
 * Decline a request.
 *
 * Frees the court immediately, so the slot goes back on the board for someone else, and
 * tells the customer why. The booking row stays, cancelled, so the history is truthful.
 */
export async function declineBookingRequest(
  request: SlotDecisionRequest,
): Promise<{ reference: string }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT b.id, b.reference, b.status, b.starts_at, b.customer_name, b.customer_phone,
              b.customer_email, s.name AS sport_name
         FROM bookings b JOIN sports s ON s.id = b.sport_id
        WHERE b.id = $1 FOR UPDATE`,
      [request.bookingId],
    );
    if (rows.length === 0) throw new BookingError("not_found", "We could not find that request.");
    const booking = rows[0];

    if (booking.status === "cancelled") {
      return { reference: booking.reference };
    }

    await client.query(
      "UPDATE reservations SET blocks_availability = false WHERE booking_id = $1",
      [request.bookingId],
    );

    await client.query(
      `UPDATE bookings
          SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'staff',
              declined_reason = $2,
              cancellation_reason = COALESCE($2, 'The venue could not take this booking.'),
              hold_expires_at = NULL
        WHERE id = $1`,
      [request.bookingId, request.note?.trim() || null],
    );

    await queueBookingNotification(client, {
      bookingId: booking.id,
      reference: booking.reference,
      template: "request_declined",
      recipientEmail: booking.customer_email,
      recipientPhone: booking.customer_phone,
      payload: {
        name: booking.customer_name,
        sport: booking.sport_name,
        when: formatVenueDateTimeShort(new Date(booking.starts_at)),
        reference: booking.reference,
        reason: request.note?.trim() ?? null,
      },
    });

    await audit(client, {
      actorType: "staff",
      actorId: request.staffId,
      action: "booking.request_declined",
      entityType: "booking",
      entityId: booking.id,
      diff: { reference: booking.reference, reason: request.note ?? null },
    });

    return { reference: booking.reference };
  });
}

// --- Rescheduling ---------------------------------------------------------------------

export interface RescheduleRequest {
  bookingId: string;
  /** New start. The sport and duration may also change. */
  startsAt: Date;
  durationMinutes?: number;
  sportSlug?: string;
  actor: Actor;
  staffId?: string | null;
  /** Staff may move a booking inside the customer cutoff. */
  overrideCutoff?: boolean;
  /** What the customer was shown for the NEW slot, so a price change is caught. */
  expectedTotalMinor?: number | null;
}

export interface RescheduleResult {
  reference: string;
  startsAt: Date;
  endsAt: Date;
  price: PriceBreakdown;
  /** Positive when the new slot costs more, negative when it costs less. */
  differenceMinor: number;
}

/**
 * Move a booking to a different time.
 *
 * Done as a move, not a cancel-and-rebook, so the booking keeps its reference, its
 * history and its access token -- the customer's existing confirmation link still works.
 *
 * The ordering inside the transaction matters. The existing reservation is released
 * FIRST, so a booking can be shifted by fifteen minutes without overlapping itself, and
 * then the new one is inserted under the same per-court lock. If the new slot turns out to
 * be taken, the whole transaction rolls back and the original reservation is still there:
 * a failed reschedule never costs the customer the slot they already had.
 *
 * The price is recomputed for the new time. Moving from off-peak into peak costs the
 * difference, and the customer is shown that before it is applied.
 */
export async function rescheduleBooking(request: RescheduleRequest): Promise<RescheduleResult> {
  await sweepExpiredHolds();

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT b.id, b.reference, b.status, b.starts_at, b.duration_minutes, b.sport_id,
              b.resource_id, b.total_minor, b.amount_paid_minor, b.policy_snapshot,
              b.coupon_code, b.customer_name, b.customer_phone, b.customer_email,
              s.slug AS sport_slug
         FROM bookings b JOIN sports s ON s.id = b.sport_id
        WHERE b.id = $1 FOR UPDATE`,
      [request.bookingId],
    );
    if (rows.length === 0) throw new BookingError("not_found", "We could not find that booking.");
    const booking = rows[0];

    if (!isCustomerManageable(booking.status)) {
      throw new BookingError(
        "not_permitted",
        `A ${booking.status.replace(/_/g, " ")} booking cannot be moved.`,
      );
    }

    // Judged by the terms frozen onto the booking, not today's settings.
    const policy = (booking.policy_snapshot ?? {}) as { rescheduleCutoffHours?: number };
    const cutoffHours = policy.rescheduleCutoffHours ?? DEFAULT_BOOKING_DEFAULTS.rescheduleCutoffHours;
    const cutoff = new Date(new Date(booking.starts_at).getTime() - cutoffHours * 3_600_000);

    if (request.actor === "customer" && !request.overrideCutoff && Date.now() > cutoff.getTime()) {
      throw new BookingError(
        "too_late",
        `This booking can no longer be moved online — that closed ${cutoffHours} hours before the start. Please call the venue.`,
      );
    }

    const targetSlug: string = request.sportSlug ?? booking.sport_slug;
    const loaded = await loadSportBySlug(targetSlug, client);
    if (!loaded) throw new BookingError("not_found", "That sport is not available here.");
    const { sport, resource } = loaded;

    const durationMinutes = request.durationMinutes ?? booking.duration_minutes;
    if (!sport.allowedDurations.includes(durationMinutes)) {
      throw new BookingError("invalid_duration", "That session length is not offered.");
    }

    await lockResource(client, resource.id);

    // If the sport is changing to one on a different court, the old court's lock is also
    // needed before its reservation is released.
    if (resource.id !== booking.resource_id) {
      await lockResource(client, booking.resource_id);
    }

    const endsAt = new Date(request.startsAt.getTime() + durationMinutes * 60_000);
    const defaults = await loadBookingDefaults(client);

    // Release the old block first, so a small shift does not collide with itself. If
    // anything below throws, the transaction rolls back and this never happened.
    await client.query(
      "UPDATE reservations SET blocks_availability = false WHERE booking_id = $1 AND blocks_availability",
      [request.bookingId],
    );

    await assertSlotBookable({
      client,
      sport,
      resource,
      startsAt: request.startsAt,
      endsAt,
      policy: {
        leadTimeMinutes: request.actor === "staff" ? 0 : defaults.leadTimeMinutes,
        bookingHorizonDays: defaults.bookingHorizonDays,
      },
      now: new Date(),
      ignoreBookingId: request.bookingId,
    });

    const [rules, coupon] = await Promise.all([
      loadPricingRules(sport.id, client),
      loadCoupon(booking.coupon_code, client),
    ]);

    const price = quoteBooking({
      sportId: sport.id,
      resourceId: resource.id,
      startsAt: request.startsAt,
      endsAt,
      rules,
      coupon,
    });

    if (
      typeof request.expectedTotalMinor === "number" &&
      request.expectedTotalMinor !== price.totalMinor
    ) {
      throw new BookingError(
        "price_changed",
        "The price for that new time is different from what you were shown. Please review it.",
      );
    }

    await insertReservation(client, {
      resourceId: resource.id,
      sportId: sport.id,
      kind: "booking",
      startsAt: request.startsAt,
      endsAt: new Date(endsAt.getTime() + resource.turnaroundMinutes * 60_000),
      bookingId: request.bookingId,
    });

    const differenceMinor = price.totalMinor - booking.total_minor;

    await client.query(
      `UPDATE bookings
          SET sport_id = $2, resource_id = $3, starts_at = $4, ends_at = $5,
              duration_minutes = $6, subtotal_minor = $7, discount_minor = $8,
              total_minor = $9, pricing_snapshot = $10,
              -- A booking that was fully paid and has become dearer is no longer fully
              -- paid. Staff settle the difference at the venue.
              payment_status = CASE
                WHEN payment_status = 'paid' AND $9 > amount_paid_minor THEN 'unpaid'::payment_status
                ELSE payment_status
              END
        WHERE id = $1`,
      [
        request.bookingId,
        sport.id,
        resource.id,
        request.startsAt.toISOString(),
        endsAt.toISOString(),
        durationMinutes,
        price.subtotalMinor,
        price.discountMinor,
        price.totalMinor,
        JSON.stringify(price),
      ],
    );

    await queueBookingNotification(client, {
      bookingId: booking.id,
      reference: booking.reference,
      template: "booking_rescheduled",
      recipientEmail: booking.customer_email,
      recipientPhone: booking.customer_phone,
      payload: {
        name: booking.customer_name,
        sport: sport.name,
        when: formatVenueDateTimeShort(request.startsAt),
        reference: booking.reference,
        totalMinor: price.totalMinor,
      },
    });

    await audit(client, {
      actorType: request.actor === "staff" ? "staff" : "customer",
      actorId: request.staffId ?? null,
      action: "booking.rescheduled",
      entityType: "booking",
      entityId: booking.id,
      diff: {
        reference: booking.reference,
        from: new Date(booking.starts_at).toISOString(),
        to: request.startsAt.toISOString(),
        priceChangeMinor: differenceMinor,
      },
    });

    return {
      reference: booking.reference,
      startsAt: request.startsAt,
      endsAt,
      price,
      differenceMinor,
    };
  });
}

// --- Staff-entered bookings ----------------------------------------------------------

export interface StaffBookingRequest {
  sportSlug: string;
  startsAt: Date;
  durationMinutes: number;
  customer: { name: string; phone: string; email?: string | null };
  source: "staff_walkin" | "staff_phone";
  staffId: string;
  notes?: string | null;
  /** Staff may take a booking inside the online lead time. */
  ignoreLeadTime?: boolean;
  markPaid?: boolean;
  paymentMethod?: string;
}

/**
 * A booking taken at the desk or over the phone.
 *
 * Goes straight to `confirmed` -- there is no checkout to wait for -- but runs through
 * exactly the same overlap checks and the same exclusion constraint as an online
 * booking, so a walk-in cannot be written over an online reservation.
 */
export async function createStaffBooking(
  request: StaffBookingRequest,
): Promise<{ bookingId: string; reference: string }> {
  const phone = normalisePakistaniPhone(request.customer.phone);
  await sweepExpiredHolds();

  return withTransaction(async (client) => {
    const loaded = await loadSportBySlug(request.sportSlug, client);
    if (!loaded) throw new BookingError("not_found", "That sport is not configured.");
    const { sport, resource } = loaded;

    await lockResource(client, resource.id);

    const defaults = await loadBookingDefaults(client);
    const endsAt = new Date(request.startsAt.getTime() + request.durationMinutes * 60_000);

    await assertSlotBookable({
      client,
      sport,
      resource,
      startsAt: request.startsAt,
      endsAt,
      policy: {
        leadTimeMinutes: request.ignoreLeadTime ? 0 : defaults.leadTimeMinutes,
        bookingHorizonDays: defaults.bookingHorizonDays,
      },
      now: new Date(),
    });

    const rules = await loadPricingRules(sport.id, client);
    const price = quoteBooking({
      sportId: sport.id,
      resourceId: resource.id,
      startsAt: request.startsAt,
      endsAt,
      rules,
    });

    const reference = generateBookingReference();
    const { hash } = generateAccessToken();

    const { rows } = await client.query(
      `INSERT INTO bookings (
         reference, access_token_hash, sport_id, resource_id, starts_at, ends_at,
         duration_minutes, status, payment_status, customer_name, customer_phone,
         customer_email, notes, source, created_by_staff_id, currency, subtotal_minor,
         discount_minor, total_minor, amount_paid_minor, pricing_snapshot, policy_snapshot,
         payment_method
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,'confirmed',$8,$9,$10,$11,$12,$13,$14,$15,$16,0,$17,$18,$19,$20,$21
       ) RETURNING id`,
      [
        reference,
        hash,
        sport.id,
        resource.id,
        request.startsAt.toISOString(),
        endsAt.toISOString(),
        request.durationMinutes,
        request.markPaid ? "paid" : "unpaid",
        request.customer.name.trim(),
        phone.e164,
        request.customer.email?.trim() || null,
        request.notes?.trim() || null,
        request.source,
        request.staffId,
        price.currency,
        price.subtotalMinor,
        price.totalMinor,
        request.markPaid ? price.totalMinor : 0,
        JSON.stringify(price),
        JSON.stringify({
          cancellationCutoffHours: defaults.cancellationCutoffHours,
          rescheduleCutoffHours: defaults.rescheduleCutoffHours,
          requiresApproval: false,
          capturedAt: new Date().toISOString(),
          enteredBy: "staff",
        }),
        request.paymentMethod ?? (request.markPaid ? "cash_at_venue" : null),
      ],
    );
    const bookingId: string = rows[0].id;

    await insertReservation(client, {
      resourceId: resource.id,
      sportId: sport.id,
      kind: "booking",
      startsAt: request.startsAt,
      endsAt: new Date(endsAt.getTime() + resource.turnaroundMinutes * 60_000),
      bookingId,
    });

    await audit(client, {
      actorType: "staff",
      actorId: request.staffId,
      action: "booking.created_by_staff",
      entityType: "booking",
      entityId: bookingId,
      diff: { reference, source: request.source, sport: sport.slug },
    });

    return { bookingId, reference };
  });
}

// --- Maintenance ---------------------------------------------------------------------

/**
 * Close a court for maintenance.
 *
 * Uses the same reservations table as bookings, so the exclusion constraint refuses to
 * schedule maintenance over an existing booking: staff are told to move the booking
 * first rather than silently stranding a customer.
 */
export async function createMaintenanceBlock(args: {
  resourceId: string;
  reason: string;
  startsAt: Date;
  endsAt: Date;
  staffId: string;
}): Promise<{ maintenanceId: string }> {
  if (args.endsAt <= args.startsAt) {
    throw new BookingError("slot_unavailable", "A maintenance block must end after it starts.");
  }
  await sweepExpiredHolds();

  return withTransaction(async (client) => {
    await lockResource(client, args.resourceId);

    const { rows: conflicts } = await client.query(
      `SELECT b.reference, b.starts_at
       FROM reservations r JOIN bookings b ON b.id = r.booking_id
       WHERE r.resource_id = $1 AND r.blocks_availability
         AND r.during && tstzrange($2::timestamptz, $3::timestamptz, '[)')
       ORDER BY b.starts_at LIMIT 5`,
      [args.resourceId, args.startsAt.toISOString(), args.endsAt.toISOString()],
    );
    if (conflicts.length > 0) {
      throw new BookingError(
        "slot_taken",
        "There are bookings in that window. Move or cancel them first.",
        conflicts.map((row) => row.reference).join(", "),
      );
    }

    const { rows } = await client.query(
      `INSERT INTO maintenance_blocks (resource_id, reason, starts_at, ends_at, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [args.resourceId, args.reason.trim(), args.startsAt.toISOString(), args.endsAt.toISOString(), args.staffId],
    );
    const maintenanceId: string = rows[0].id;

    await insertReservation(client, {
      resourceId: args.resourceId,
      sportId: null,
      kind: "maintenance",
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      maintenanceId,
    });

    await audit(client, {
      actorType: "staff",
      actorId: args.staffId,
      action: "maintenance.created",
      entityType: "maintenance_block",
      entityId: maintenanceId,
      diff: { reason: args.reason, startsAt: args.startsAt.toISOString() },
    });

    return { maintenanceId };
  });
}

// --- Shared helpers ------------------------------------------------------------------

/**
 * Queue transactional messages in the same transaction as the booking change.
 *
 * Nothing is sent from here. A dead SMTP server therefore delays a confirmation email;
 * it cannot roll back a confirmed booking.
 */
async function queueBookingNotification(
  client: PoolClient,
  args: {
    bookingId: string;
    reference: string;
    template: string;
    recipientEmail?: string | null;
    recipientPhone?: string | null;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const targets: Array<{ channel: "email" | "whatsapp"; recipient: string }> = [];
  if (args.recipientEmail) targets.push({ channel: "email", recipient: args.recipientEmail });
  if (args.recipientPhone) targets.push({ channel: "whatsapp", recipient: args.recipientPhone });

  for (const target of targets) {
    await client.query(
      `INSERT INTO notifications (channel, template, recipient, payload, dedupe_key, booking_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        target.channel,
        args.template,
        target.recipient,
        JSON.stringify(args.payload),
        notificationDedupeKey([args.template, args.bookingId, target.channel, target.recipient]),
        args.bookingId,
      ],
    );
  }
}

/**
 * Queue a message to the VENUE rather than to a customer.
 *
 * The recipient is resolved by the worker from `VENUE_NOTIFICATION_EMAIL`, so the address
 * can change without rewriting queued rows, and nothing here has to invent a customer
 * record for the venue itself.
 */
async function queueVenueNotification(
  client: PoolClient,
  args: { bookingId?: string | null; template: string; payload: Record<string, unknown> },
): Promise<void> {
  await client.query(
    `INSERT INTO notifications (channel, template, recipient, payload, dedupe_key, booking_id, audience)
     VALUES ('email', $1, 'venue', $2, $3, $4, 'venue')
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      args.template,
      JSON.stringify(args.payload),
      notificationDedupeKey([args.template, args.bookingId ?? "none", "venue"]),
      args.bookingId ?? null,
    ],
  );
}

export async function audit(
  client: PoolClient,
  entry: {
    actorType: "customer" | "staff" | "system" | "webhook";
    actorId?: string | null;
    actorLabel?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    diff?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (actor_type, actor_id, actor_label, action, entity_type, entity_id, diff)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      entry.actorType,
      entry.actorId ?? null,
      entry.actorLabel ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      JSON.stringify(entry.diff ?? {}),
    ],
  );
}

/** Business day of an instant, matching the 05:00 rollover used everywhere else. */
function businessDateOfInstant(instant: Date): VenueDate {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const hourMinute = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
  const [hour, minute] = hourMinute.split(":").map((part) => Number.parseInt(part, 10));
  return (hour % 24) * 60 + minute < 300 ? addVenueDays(iso, -1) : iso;
}

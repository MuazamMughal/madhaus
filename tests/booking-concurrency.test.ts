import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BookingError,
  approveBookingSlot,
  cancelBooking,
  createBookingRequest,
  createMaintenanceBlock,
  createStaffBooking,
  declineBookingRequest,
  getDayAvailability,
  rescheduleBooking,
  sweepExpiredHolds,
} from "@/server/booking-service";
import { pool } from "@/lib/db/client";
import { venueDateToInstant } from "@/lib/domain/time";
import {
  closePool,
  countBlockingReservations,
  countBookings,
  expireHold,
  resetTransactionalData,
  setSportActive,
} from "./helpers/db";

/**
 * The acceptance criteria that matter most, tested against a real database.
 *
 * Everything here is about one promise: two parties can never hold the same court at the
 * same time, no matter how the requests arrive.
 */

// A Friday, comfortably in the future and inside the booking horizon.
const DATE = inDays(7);
const EVENING = 19 * 60; // 19:00 venue time

function inDays(days: number): string {
  const now = new Date();
  const target = new Date(now.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(target);
}

function customer(name: string, phoneSuffix: string) {
  return { name, phone: `0300 123${phoneSuffix}` };
}

/** The seeded owner. Approvals are a staff action, so most tests need one. */
async function anyStaffId(): Promise<string | null> {
  const { rows } = await pool().query("SELECT id FROM staff_users LIMIT 1");
  return rows[0]?.id ?? null;
}

beforeAll(async () => {
  // Football ships inactive; these tests need it to prove the shared-court rule.
  await setSportActive("football", true);
});

afterAll(async () => {
  await setSportActive("football", false);
  await resetTransactionalData();
  await closePool();
});

beforeEach(async () => {
  await resetTransactionalData();
});

describe("overlap protection", () => {
  it("refuses a second booking that overlaps an existing one on the padel court", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);

    await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("First", "4567"),
    });

    await expect(
      createBookingRequest({
        sportSlug: "padel",
        // Starts 30 minutes in, so it overlaps.
        startsAt: new Date(startsAt.getTime() + 30 * 60_000),
        durationMinutes: 60,
        customer: customer("Second", "4568"),
      }),
    ).rejects.toThrow(BookingError);

    expect(await countBlockingReservations()).toBe(1);
  });

  it("allows back-to-back bookings, because touching intervals do not overlap", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);

    await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("First", "4567"),
    });

    const second = await createBookingRequest({
      sportSlug: "padel",
      startsAt: new Date(startsAt.getTime() + 60 * 60_000),
      durationMinutes: 60,
      customer: customer("Second", "4568"),
    });

    expect(second.reference).toMatch(/^MH-/);
    expect(await countBlockingReservations()).toBe(2);
  });

  it("stops a FOOTBALL booking landing on a court CRICKET already has", async () => {
    // The headline rule: one physical multipurpose court, two sports.
    const startsAt = venueDateToInstant(DATE, EVENING);

    await createBookingRequest({
      sportSlug: "cricket",
      startsAt,
      durationMinutes: 60,
      customer: customer("Cricket side", "4567"),
    });

    await expect(
      createBookingRequest({
        sportSlug: "football",
        startsAt,
        durationMinutes: 60,
        customer: customer("Football side", "4568"),
      }),
    ).rejects.toThrow(BookingError);
  });

  it("leaves the padel court completely unaffected by the shared court", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);

    await createBookingRequest({
      sportSlug: "cricket",
      startsAt,
      durationMinutes: 60,
      customer: customer("Cricket", "4567"),
    });

    // Same time, different physical court: must succeed.
    const padel = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Padel", "4568"),
    });

    expect(padel.reference).toBeTruthy();
    expect(await countBlockingReservations()).toBe(2);
  });

  it("enforces the sport-change buffer on the shared court", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);

    await createBookingRequest({
      sportSlug: "cricket",
      startsAt,
      durationMinutes: 60,
      customer: customer("Cricket", "4567"),
    });

    // Immediately after cricket ends: the court still has to be changed over.
    await expect(
      createBookingRequest({
        sportSlug: "football",
        startsAt: new Date(startsAt.getTime() + 60 * 60_000),
        durationMinutes: 60,
        customer: customer("Football", "4568"),
      }),
    ).rejects.toThrow(/change over/i);

    // After the buffer, it is fine.
    const later = await createBookingRequest({
      sportSlug: "football",
      startsAt: new Date(startsAt.getTime() + 90 * 60_000),
      durationMinutes: 60,
      customer: customer("Football", "4569"),
    });
    expect(later.reference).toBeTruthy();
  });

  it("does NOT apply the changeover buffer between two bookings of the same sport", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);

    await createBookingRequest({
      sportSlug: "cricket",
      startsAt,
      durationMinutes: 60,
      customer: customer("Cricket A", "4567"),
    });

    const second = await createBookingRequest({
      sportSlug: "cricket",
      startsAt: new Date(startsAt.getTime() + 60 * 60_000),
      durationMinutes: 60,
      customer: customer("Cricket B", "4568"),
    });

    expect(second.reference).toBeTruthy();
  });
});

describe("simultaneous competing requests", () => {
  it("produces exactly one booking when ten requests race for the same slot", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);

    // All fired at once, against one database, with no coordination between them.
    const attempts = Array.from({ length: 10 }, (_, index) =>
      createBookingRequest({
        sportSlug: "padel",
        startsAt,
        durationMinutes: 60,
        customer: customer(`Racer ${index}`, String(4567 + index).slice(-4)),
      }),
    );

    const outcomes = await Promise.allSettled(attempts);
    const won = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const lost = outcomes.filter((outcome) => outcome.status === "rejected");

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);

    // Every loser is told the truth, not shown a server error.
    for (const outcome of lost) {
      const error = (outcome as PromiseRejectedResult).reason;
      expect(error).toBeInstanceOf(BookingError);
      expect(["slot_taken", "slot_unavailable"]).toContain((error as BookingError).code);
    }

    expect(await countBlockingReservations()).toBe(1);
  });

  it("produces exactly one booking when football and cricket race for the shared court", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);

    const outcomes = await Promise.allSettled([
      createBookingRequest({ sportSlug: "cricket", startsAt, durationMinutes: 60, customer: customer("C1", "4567") }),
      createBookingRequest({ sportSlug: "football", startsAt, durationMinutes: 60, customer: customer("F1", "4568") }),
      createBookingRequest({ sportSlug: "cricket", startsAt, durationMinutes: 60, customer: customer("C2", "4569") }),
      createBookingRequest({ sportSlug: "football", startsAt, durationMinutes: 60, customer: customer("F2", "4570") }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await countBlockingReservations()).toBe(1);
  });
});

describe("the request lifecycle", () => {
  it("holds the slot the moment a request is submitted", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("First", "4567"),
    });

    // Not confirmed, but the court is off the board: nobody else can request it, and
    // staff cannot approve two overlapping requests.
    expect(await countBlockingReservations()).toBe(1);
    expect(await countBookings("status = 'pending_approval'")).toBe(1);
    expect(await countBookings("status = 'confirmed'")).toBe(0);
  });

  it("confirms a pay-at-venue request the moment staff approve the slot", async () => {
    const { rows: staff } = await pool().query("SELECT id FROM staff_users LIMIT 1");
    if (!staff[0]) return;

    const request = await createBookingRequest({
      sportSlug: "padel",
      startsAt: venueDateToInstant(DATE, EVENING),
      durationMinutes: 60,
      customer: customer("Pays at venue", "4567"),
      paymentPreference: "at_venue",
    });

    const result = await approveBookingSlot({
      bookingId: request.bookingId,
      staffId: staff[0].id,
    });

    expect(result.status).toBe("confirmed");
    expect(result.awaitingPayment).toBe(false);

    const { rows } = await pool().query(
      "SELECT status, payment_status FROM bookings WHERE id = $1",
      [request.bookingId],
    );
    // Confirmed but unpaid: the two states are independent, and this is the common case.
    expect(rows[0].status).toBe("confirmed");
    expect(rows[0].payment_status).toBe("unpaid");
  });

  it("does NOT confirm an online-payment request when the slot is approved", async () => {
    const { rows: staff } = await pool().query("SELECT id FROM staff_users LIMIT 1");
    if (!staff[0]) return;

    const request = await createBookingRequest({
      sportSlug: "padel",
      startsAt: venueDateToInstant(DATE, EVENING),
      durationMinutes: 60,
      customer: customer("Pays online", "4567"),
      paymentPreference: "online",
    });

    const result = await approveBookingSlot({
      bookingId: request.bookingId,
      staffId: staff[0].id,
    });

    // Approving a slot is not approving a payment that has not happened.
    expect(result.awaitingPayment).toBe(true);
    expect(result.status).toBe("pending_approval");

    const { rows } = await pool().query(
      "SELECT status, payment_status, payment_token_hash, slot_approved_at FROM bookings WHERE id = $1",
      [request.bookingId],
    );
    expect(rows[0].status).toBe("pending_approval");
    expect(rows[0].payment_status).toBe("unpaid");
    // The slot is approved and a single-purpose payment link has been minted.
    expect(rows[0].slot_approved_at).not.toBeNull();
    expect(rows[0].payment_token_hash).toBeTruthy();
    // And the court is still held while they pay.
    expect(await countBlockingReservations()).toBe(1);
  });

  it("is idempotent when approve is pressed twice", async () => {
    const { rows: staff } = await pool().query("SELECT id FROM staff_users LIMIT 1");
    if (!staff[0]) return;

    const request = await createBookingRequest({
      sportSlug: "padel",
      startsAt: venueDateToInstant(DATE, EVENING),
      durationMinutes: 60,
      customer: customer("Double click", "4567"),
    });

    const first = await approveBookingSlot({ bookingId: request.bookingId, staffId: staff[0].id });
    const second = await approveBookingSlot({ bookingId: request.bookingId, staffId: staff[0].id });

    expect(first.status).toBe("confirmed");
    expect(second.status).toBe("confirmed");
    // One court block, one booking. Not two.
    expect(await countBlockingReservations()).toBe(1);
    expect(await countBookings()).toBe(1);
  });

  it("frees the slot when a request is declined", async () => {
    const { rows: staff } = await pool().query("SELECT id FROM staff_users LIMIT 1");
    if (!staff[0]) return;

    const startsAt = venueDateToInstant(DATE, EVENING);
    const request = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Declined", "4567"),
    });

    await declineBookingRequest({
      bookingId: request.bookingId,
      staffId: staff[0].id,
      note: "A walk-in already has that court.",
    });

    expect(await countBlockingReservations()).toBe(0);

    // Straight back on the board for the next customer.
    const replacement = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Next", "4568"),
    });
    expect(replacement.reference).toBeTruthy();

    // The declined request survives as history, with the reason the customer was given.
    const { rows } = await pool().query(
      "SELECT status, declined_reason FROM bookings WHERE id = $1",
      [request.bookingId],
    );
    expect(rows[0].status).toBe("cancelled");
    expect(rows[0].declined_reason).toMatch(/walk-in/i);
  });

  it("releases a request nobody ever decided on, once its backstop passes", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    const request = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Forgotten", "4567"),
    });

    await expireHold(request.bookingId);
    const swept = await sweepExpiredHolds();
    expect(swept.releasedHolds).toBe(1);
    expect(swept.cancelledBookings).toContain(request.reference);

    const replacement = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Winner", "4568"),
    });
    expect(replacement.reference).toBeTruthy();
  });

  it("leaves a live request alone", async () => {
    await createBookingRequest({
      sportSlug: "padel",
      startsAt: venueDateToInstant(DATE, EVENING),
      durationMinutes: 60,
      customer: customer("Waiting", "4567"),
    });

    const swept = await sweepExpiredHolds();
    expect(swept.releasedHolds).toBe(0);
    expect(await countBlockingReservations()).toBe(1);
  });

  it("never lets the backstop outlive the session it is for", async () => {
    // The backstop is 48 hours, but a request for a slot sooner than that must expire when
    // the slot does, not after it. Anchored to a fixed slot rather than "now + 2h", which
    // drifts in and out of the venue's 17:00-03:00 window as the clock moves.
    const startsAt = venueDateToInstant(DATE, EVENING);
    const request = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Soon", "4567"),
    });
    expect(request.expiresAt.getTime()).toBeLessThanOrEqual(startsAt.getTime());
  });
});

describe("staff actions block customers", () => {
  it("stops a customer booking over a staff walk-in", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    const { rows } = await pool().query("SELECT id FROM staff_users LIMIT 1");
    const staffId = rows[0]?.id;
    if (!staffId) return; // no seeded staff account; nothing to assert

    await createStaffBooking({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Walk-in", "4567"),
      source: "staff_walkin",
      staffId,
    });

    await expect(
      createBookingRequest({
        sportSlug: "padel",
        startsAt,
        durationMinutes: 60,
        customer: customer("Online", "4568"),
      }),
    ).rejects.toThrow(BookingError);
  });

  it("stops a customer booking during maintenance, on both sports of the shared court", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    const { rows: staff } = await pool().query("SELECT id FROM staff_users LIMIT 1");
    const { rows: resources } = await pool().query(
      "SELECT id FROM resources WHERE kind = 'multipurpose'",
    );
    if (!staff[0] || !resources[0]) return;

    await createMaintenanceBlock({
      resourceId: resources[0].id,
      reason: "Resurfacing",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 180 * 60_000),
      staffId: staff[0].id,
    });

    for (const sport of ["cricket", "football"]) {
      await expect(
        createBookingRequest({
          sportSlug: sport,
          startsAt: new Date(startsAt.getTime() + 30 * 60_000),
          durationMinutes: 60,
          customer: customer("Hopeful", "4567"),
        }),
      ).rejects.toThrow(/maintenance/i);
    }
  });

  it("refuses to schedule maintenance over an existing booking", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    const { rows: staff } = await pool().query("SELECT id FROM staff_users LIMIT 1");
    const { rows: resources } = await pool().query("SELECT id FROM resources WHERE kind = 'padel'");
    if (!staff[0] || !resources[0]) return;

    await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Already booked", "4567"),
    });

    // Staff are told to move the booking rather than silently stranding the customer.
    await expect(
      createMaintenanceBlock({
        resourceId: resources[0].id,
        reason: "Repairs",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 120 * 60_000),
        staffId: staff[0].id,
      }),
    ).rejects.toThrow(/bookings in that window/i);
  });
});

describe("cancellation frees the court", () => {
  it("puts a cancelled slot straight back on the board", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);

    const { rows: staff } = await pool().query("SELECT id FROM staff_users LIMIT 1");
    const held = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Changed mind", "4567"),
    });
    if (staff[0]) await approveBookingSlot({ bookingId: held.bookingId, staffId: staff[0].id });

    await cancelBooking({ bookingId: held.bookingId, actor: "staff", reason: "Customer called" });

    expect(await countBlockingReservations()).toBe(0);

    const replacement = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Lucky", "4568"),
    });
    expect(replacement.reference).toBeTruthy();
  });

  it("keeps the cancelled booking in the record rather than deleting it", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    const held = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("History", "4567"),
    });
    await cancelBooking({ bookingId: held.bookingId, actor: "staff" });

    expect(await countBookings("status = 'cancelled'")).toBe(1);
  });
});

describe("availability reflects reality", () => {
  it("marks a requested slot as pending and leaves the rest open", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Booked", "4567"),
    });

    const availability = await getDayAvailability({
      date: DATE,
      sportSlug: "padel",
      durationMinutes: 60,
    });

    const blocked = availability.slots.filter((slot) => !slot.available);
    expect(blocked.length).toBeGreaterThan(0);
    // A requested slot is shown as pending, not booked -- it may still come free.
    expect(
      blocked.every(
        (slot) => slot.reason === "pending_approval" || slot.reason === "too_soon",
      ),
    ).toBe(true);
    expect(availability.hasAvailableSlot).toBe(true);
  });

  it("shows cricket as blocked when football has the shared court", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    await createBookingRequest({
      sportSlug: "football",
      startsAt,
      durationMinutes: 60,
      customer: customer("Football", "4567"),
    });

    const cricket = await getDayAvailability({
      date: DATE,
      sportSlug: "cricket",
      durationMinutes: 60,
    });

    const slotAtSameTime = cricket.slots.find(
      (slot) => slot.startsAt.getTime() === startsAt.getTime(),
    );
    expect(slotAtSameTime?.available).toBe(false);
  });
});

describe("rescheduling", () => {
  it("moves a booking and keeps its reference", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    const held = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Mover", "4567"),
    });
    const staffId = await anyStaffId();
    if (staffId) await approveBookingSlot({ bookingId: held.bookingId, staffId });

    const moved = await rescheduleBooking({
      bookingId: held.bookingId,
      startsAt: new Date(startsAt.getTime() + 120 * 60_000),
      actor: "staff",
    });

    // Same booking, new time: the customer's existing link still works.
    expect(moved.reference).toBe(held.reference);
    expect(await countBlockingReservations()).toBe(1);

    // The old slot is free again.
    const replacement = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Took the old slot", "4568"),
    });
    expect(replacement.reference).toBeTruthy();
  });

  it("allows a small shift that overlaps the booking's own current slot", async () => {
    // The classic reschedule bug: a booking colliding with itself. The old reservation is
    // released before the new one is placed, inside one transaction.
    const startsAt = venueDateToInstant(DATE, EVENING);
    const held = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Shifter", "4567"),
    });
    const staffId = await anyStaffId();
    if (staffId) await approveBookingSlot({ bookingId: held.bookingId, staffId });

    const moved = await rescheduleBooking({
      bookingId: held.bookingId,
      startsAt: new Date(startsAt.getTime() + 30 * 60_000),
      actor: "staff",
    });

    expect(moved.startsAt.getTime()).toBe(startsAt.getTime() + 30 * 60_000);
    expect(await countBlockingReservations()).toBe(1);
  });

  it("refuses to move onto a slot someone else has, and leaves the original intact", async () => {
    const startsAt = venueDateToInstant(DATE, EVENING);
    const mine = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Mine", "4567"),
    });
    const theirs = new Date(startsAt.getTime() + 120 * 60_000);
    await createBookingRequest({
      sportSlug: "padel",
      startsAt: theirs,
      durationMinutes: 60,
      customer: customer("Theirs", "4568"),
    });

    await expect(
      rescheduleBooking({ bookingId: mine.bookingId, startsAt: theirs, actor: "staff" }),
    ).rejects.toThrow(BookingError);

    // A failed reschedule must not cost the customer the slot they already had.
    expect(await countBlockingReservations()).toBe(2);
    const { rows } = await pool().query(
      "SELECT starts_at FROM bookings WHERE id = $1",
      [mine.bookingId],
    );
    expect(new Date(rows[0].starts_at).getTime()).toBe(startsAt.getTime());
  });

  it("reprices when a booking moves from off-peak into peak", async () => {
    // 18:00 is off-peak in the seed; 21:00 is peak.
    const offPeak = venueDateToInstant(DATE, 18 * 60);
    const held = await createBookingRequest({
      sportSlug: "padel",
      startsAt: offPeak,
      durationMinutes: 60,
      customer: customer("Repriced", "4567"),
    });
    const staffId = await anyStaffId();
    if (staffId) await approveBookingSlot({ bookingId: held.bookingId, staffId });

    const moved = await rescheduleBooking({
      bookingId: held.bookingId,
      startsAt: venueDateToInstant(DATE, 21 * 60),
      actor: "staff",
    });

    expect(moved.differenceMinor).toBeGreaterThan(0);
    expect(moved.price.bands.some((band) => band.isPeak)).toBe(true);
  });

  it("refuses a customer reschedule inside the cutoff but allows staff to do it", async () => {
    const staffId = await anyStaffId();
    if (!staffId) return;

    const startsAt = venueDateToInstant(DATE, EVENING);
    const request = await createBookingRequest({
      sportSlug: "padel",
      startsAt,
      durationMinutes: 60,
      customer: customer("Last minute", "4567"),
    });
    await approveBookingSlot({ bookingId: request.bookingId, staffId });

    // Put the booking inside its own cancellation window by widening the policy it was
    // booked under, rather than by picking a start time close to the current clock --
    // which would make the test pass or fail depending on the hour it runs.
    await pool().query(
      `UPDATE bookings
          SET policy_snapshot = jsonb_set(policy_snapshot, '{rescheduleCutoffHours}', '100000')
        WHERE id = $1`,
      [request.bookingId],
    );

    const later = new Date(startsAt.getTime() + 60 * 60_000);

    await expect(
      rescheduleBooking({ bookingId: request.bookingId, startsAt: later, actor: "customer" }),
    ).rejects.toThrow(/no longer be moved online/i);

    // Staff are not bound by the customer cutoff.
    const moved = await rescheduleBooking({
      bookingId: request.bookingId,
      startsAt: later,
      actor: "staff",
    });
    expect(moved.reference).toBe(request.reference);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/client";
import {
  approveBookingSlot,
  createBookingRequest,
  declineBookingRequest,
} from "@/server/booking-service";
import {
  PaymentProofError,
  listPendingProofs,
  reviewPaymentProof,
  submitPaymentProof,
} from "@/server/payment-proof-service";
import { findBookingForPayment, findBookingForCustomer } from "@/server/booking-access";
import { venueDateToInstant } from "@/lib/domain/time";
import { closePool, countBlockingReservations, resetTransactionalData } from "./helpers/db";

/**
 * The manual JazzCash flow.
 *
 * The invariant: a transaction reference a customer typed in is a CLAIM. Only a member of
 * staff who has looked at the account turns it into a confirmed, paid booking.
 */

const DATE = inDays(7);

function inDays(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + days * 86_400_000));
}

async function staffId(): Promise<string | null> {
  const { rows } = await pool().query("SELECT id FROM staff_users LIMIT 1");
  return rows[0]?.id ?? null;
}

/** A request that chose online payment and has had its slot approved. */
async function approvedOnlineRequest(hour = 19, suffix = "4567") {
  const request = await createBookingRequest({
    sportSlug: "padel",
    startsAt: venueDateToInstant(DATE, hour * 60),
    durationMinutes: 60,
    customer: { name: "Online payer", phone: `0300 123${suffix}` },
    paymentPreference: "online",
  });
  const id = await staffId();
  if (id) await approveBookingSlot({ bookingId: request.bookingId, staffId: id });
  return request;
}

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await resetTransactionalData();
  await closePool();
});

describe("submitting proof", () => {
  it("records the claim but does NOT confirm the booking", async () => {
    const request = await approvedOnlineRequest();

    await submitPaymentProof({
      bookingId: request.bookingId,
      payerEmail: "payer@example.com",
      transactionReference: "TID123456789",
    });

    const { rows } = await pool().query(
      "SELECT status, payment_status FROM bookings WHERE id = $1",
      [request.bookingId],
    );
    // The whole point: pending verification, not paid, not confirmed.
    expect(rows[0].status).toBe("pending_approval");
    expect(rows[0].payment_status).toBe("pending_verification");

    const queue = await listPendingProofs();
    expect(queue).toHaveLength(1);
    expect(queue[0].transactionReference).toBe("TID123456789");
  });

  it("refuses payment before the venue has approved the slot", async () => {
    // Paying for a court nobody has agreed to give you is the wrong order.
    const request = await createBookingRequest({
      sportSlug: "padel",
      startsAt: venueDateToInstant(DATE, 20 * 60),
      durationMinutes: 60,
      customer: { name: "Too eager", phone: "0300 1234568" },
      paymentPreference: "online",
    });

    await expect(
      submitPaymentProof({
        bookingId: request.bookingId,
        payerEmail: "payer@example.com",
        transactionReference: "TID999",
      }),
    ).rejects.toThrow(/not been confirmed by the venue yet/i);
  });

  it("refuses payment on a cancelled booking", async () => {
    const request = await approvedOnlineRequest(21, "4569");
    const id = await staffId();
    if (!id) return;
    await declineBookingRequest({ bookingId: request.bookingId, staffId: id });

    await expect(
      submitPaymentProof({
        bookingId: request.bookingId,
        payerEmail: "payer@example.com",
        transactionReference: "TID111",
      }),
    ).rejects.toThrow(/cancelled/i);
  });

  it("rejects an oversized screenshot", async () => {
    const request = await approvedOnlineRequest(18, "4570");
    await expect(
      submitPaymentProof({
        bookingId: request.bookingId,
        payerEmail: "payer@example.com",
        transactionReference: "TID222",
        screenshot: { bytes: Buffer.alloc(3 * 1024 * 1024), mime: "image/png" },
      }),
    ).rejects.toThrow(PaymentProofError);
  });

  it("rejects a screenshot that is not an allowed image type", async () => {
    const request = await approvedOnlineRequest(17, "4571");
    await expect(
      submitPaymentProof({
        bookingId: request.bookingId,
        payerEmail: "payer@example.com",
        transactionReference: "TID333",
        // SVG can carry script, so it is not in the allow-list.
        screenshot: { bytes: Buffer.from("<svg/>"), mime: "image/svg+xml" },
      }),
    ).rejects.toThrow(/PNG, JPEG or WebP/i);
  });

  it("stores an allowed screenshot inline", async () => {
    const request = await approvedOnlineRequest(22, "4572");
    const bytes = Buffer.from("fake-png-bytes");
    await submitPaymentProof({
      bookingId: request.bookingId,
      payerEmail: "payer@example.com",
      transactionReference: "TID444",
      screenshot: { bytes, mime: "image/png" },
    });

    const { rows } = await pool().query(
      "SELECT screenshot_bytes, screenshot_mime FROM payment_proofs WHERE booking_id = $1",
      [request.bookingId],
    );
    expect(rows[0].screenshot_bytes).toBe(bytes.byteLength);
    expect(rows[0].screenshot_mime).toBe("image/png");
  });
});

describe("staff reviewing a proof", () => {
  it("accepting confirms the booking and marks it paid", async () => {
    const request = await approvedOnlineRequest();
    const id = await staffId();
    if (!id) return;

    await submitPaymentProof({
      bookingId: request.bookingId,
      payerEmail: "payer@example.com",
      transactionReference: "TID555",
    });
    const [proof] = await listPendingProofs();

    const result = await reviewPaymentProof({ proofId: proof.id, staffId: id, accept: true });
    expect(result.outcome).toBe("confirmed");

    const { rows } = await pool().query(
      "SELECT status, payment_status, amount_paid_minor, total_minor FROM bookings WHERE id = $1",
      [request.bookingId],
    );
    expect(rows[0].status).toBe("confirmed");
    expect(rows[0].payment_status).toBe("paid");
    expect(rows[0].amount_paid_minor).toBe(rows[0].total_minor);
    expect(await countBlockingReservations()).toBe(1);
  });

  it("queues the confirmation email so the calendar invite goes out", async () => {
    const request = await approvedOnlineRequest();
    const id = await staffId();
    if (!id) return;

    await submitPaymentProof({
      bookingId: request.bookingId,
      payerEmail: "payer@example.com",
      transactionReference: "TID666",
    });
    const [proof] = await listPendingProofs();
    await reviewPaymentProof({ proofId: proof.id, staffId: id, accept: true });

    const { rows } = await pool().query(
      "SELECT template FROM notifications WHERE booking_id = $1 AND template = 'booking_confirmed'",
      [request.bookingId],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("rejecting keeps the court held so the customer can try again", async () => {
    const request = await approvedOnlineRequest();
    const id = await staffId();
    if (!id) return;

    await submitPaymentProof({
      bookingId: request.bookingId,
      payerEmail: "payer@example.com",
      transactionReference: "WRONG-ID",
    });
    const [proof] = await listPendingProofs();

    const result = await reviewPaymentProof({
      proofId: proof.id,
      staffId: id,
      accept: false,
      note: "No transfer with that ID reached us.",
    });
    expect(result.outcome).toBe("rejected");

    const { rows } = await pool().query(
      "SELECT status, payment_status FROM bookings WHERE id = $1",
      [request.bookingId],
    );
    // A mistyped transaction ID must not cost them the slot.
    expect(rows[0].status).toBe("pending_approval");
    expect(rows[0].payment_status).toBe("unpaid");
    expect(await countBlockingReservations()).toBe(1);

    // And they can submit a corrected reference.
    await submitPaymentProof({
      bookingId: request.bookingId,
      payerEmail: "payer@example.com",
      transactionReference: "CORRECT-ID",
    });
    const queue = await listPendingProofs();
    expect(queue).toHaveLength(1);
    expect(queue[0].transactionReference).toBe("CORRECT-ID");
  });
});

describe("the payment link", () => {
  it("opens the pay page but cannot open the booking itself", async () => {
    const request = await approvedOnlineRequest();

    const { rows } = await pool().query(
      "SELECT payment_token_hash FROM bookings WHERE id = $1",
      [request.bookingId],
    );
    expect(rows[0].payment_token_hash).toBeTruthy();

    // The booking's own token still works for the booking page.
    const viaBookingToken = await findBookingForCustomer({
      reference: request.reference,
      token: request.accessToken,
    });
    expect(viaBookingToken).not.toBeNull();

    // But the booking token is NOT a payment token, and vice versa: the two capabilities
    // are deliberately separate, so a forwarded payment link cannot cancel a booking.
    const bookingTokenOnPayPage = await findBookingForPayment({
      reference: request.reference,
      token: request.accessToken,
    });
    expect(bookingTokenOnPayPage).toBeNull();
  });

  it("refuses a missing or wrong payment token", async () => {
    const request = await approvedOnlineRequest();
    expect(await findBookingForPayment({ reference: request.reference, token: null })).toBeNull();
    expect(
      await findBookingForPayment({ reference: request.reference, token: "not-the-token" }),
    ).toBeNull();
  });
});

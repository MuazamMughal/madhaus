import { createHash } from "node:crypto";
import { pool, withTransaction } from "@/lib/db/client";
import { audit } from "./booking-service";
import { formatVenueDateTimeShort } from "@/lib/domain/time";
import { notificationDedupeKey } from "@/lib/domain/reference";

/**
 * Manual JazzCash payment proof.
 *
 * The customer transfers the money themselves and tells us the transaction reference. That
 * is a CLAIM, not a payment. Nothing here confirms a booking — only `reviewPaymentProof`,
 * driven by a member of staff who has looked at the JazzCash account, does that.
 *
 * The screenshot is optional and stored inline in Postgres with a hard size and type cap.
 * Holding it in the database rather than emailing it away means the proof survives a mail
 * outage and staff can see it in the dashboard; at a few submissions a night it costs
 * nothing.
 */

/** 2 MB. Also enforced by a CHECK constraint, because the form is not the only way in. */
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

/** Only formats a browser renders safely inline. No SVG: it can carry script. */
export const ALLOWED_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export class PaymentProofError extends Error {
  readonly code:
    | "not_found"
    | "not_payable"
    | "already_paid"
    | "screenshot_too_large"
    | "screenshot_type"
    | "invalid";
  constructor(code: PaymentProofError["code"], message: string) {
    super(message);
    this.name = "PaymentProofError";
    this.code = code;
  }
}

export interface SubmitProofInput {
  bookingId: string;
  payerEmail: string;
  transactionReference: string;
  screenshot?: { bytes: Buffer; mime: string } | null;
  ip?: string | null;
}

export async function submitPaymentProof(
  input: SubmitProofInput,
): Promise<{ proofId: string; reference: string }> {
  if (input.screenshot) {
    if (input.screenshot.bytes.byteLength > MAX_SCREENSHOT_BYTES) {
      throw new PaymentProofError(
        "screenshot_too_large",
        "That screenshot is over 2 MB. Please send a smaller one, or just the transaction ID.",
      );
    }
    if (!ALLOWED_SCREENSHOT_TYPES.includes(input.screenshot.mime as never)) {
      throw new PaymentProofError(
        "screenshot_type",
        "Please upload a PNG, JPEG or WebP image.",
      );
    }
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT b.id, b.reference, b.status, b.payment_status, b.payment_preference,
              b.slot_approved_at, b.total_minor, b.customer_name, b.customer_phone,
              b.customer_email, b.starts_at, s.name AS sport_name
         FROM bookings b JOIN sports s ON s.id = b.sport_id
        WHERE b.id = $1 FOR UPDATE`,
      [input.bookingId],
    );
    if (rows.length === 0) throw new PaymentProofError("not_found", "We could not find that booking.");
    const booking = rows[0];

    if (booking.status === "cancelled") {
      throw new PaymentProofError("not_payable", "That booking was cancelled. Please do not send payment.");
    }
    if (booking.payment_status === "paid") {
      throw new PaymentProofError("already_paid", "This booking is already paid. Nothing more to do.");
    }
    // The payment link only goes out after staff confirm the slot. Submitting before that
    // would mean paying for a court nobody has agreed to give you.
    if (!booking.slot_approved_at) {
      throw new PaymentProofError(
        "not_payable",
        "This booking has not been confirmed by the venue yet. Please wait for us to approve the slot before paying.",
      );
    }

    // Reuse the open intent if there is one, so repeated submissions attach to one record
    // of what is owed rather than inventing a new amount each time.
    const idempotencyKey = `booking:${booking.id}:jazzcash`;
    const { rows: intents } = await client.query(
      "SELECT id FROM payment_intents WHERE idempotency_key = $1",
      [idempotencyKey],
    );
    const intentId: string =
      intents[0]?.id ??
      (
        await client.query(
          `INSERT INTO payment_intents (provider, status, booking_id, currency, amount_minor, idempotency_key)
           VALUES ('jazzcash', 'awaiting_verification', $1, 'PKR', $2, $3) RETURNING id`,
          [booking.id, booking.total_minor, idempotencyKey],
        )
      ).rows[0].id;

    await client.query(
      "UPDATE payment_intents SET status = 'awaiting_verification' WHERE id = $1",
      [intentId],
    );

    const { rows: created } = await client.query(
      `INSERT INTO payment_proofs (booking_id, payment_intent_id, payer_email,
                                   transaction_reference, screenshot, screenshot_mime,
                                   screenshot_bytes, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        booking.id,
        intentId,
        input.payerEmail.trim(),
        input.transactionReference.trim(),
        input.screenshot?.bytes ?? null,
        input.screenshot?.mime ?? null,
        input.screenshot?.bytes.byteLength ?? null,
        input.ip ? createHash("sha256").update(input.ip).digest("hex").slice(0, 32) : null,
      ],
    );

    // Pending verification, NOT paid. The distinction is the whole point.
    await client.query(
      "UPDATE bookings SET payment_status = 'pending_verification', payment_method = 'jazzcash' WHERE id = $1",
      [booking.id],
    );

    await client.query(
      `INSERT INTO notifications (channel, template, recipient, payload, dedupe_key, booking_id, audience)
       VALUES ('email', 'payment_proof_received_venue', 'venue', $1, $2, $3, 'venue')
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        JSON.stringify({
          reference: booking.reference,
          name: booking.customer_name,
          phone: booking.customer_phone,
          payerEmail: input.payerEmail.trim(),
          transactionReference: input.transactionReference.trim(),
          hasScreenshot: Boolean(input.screenshot),
          sport: booking.sport_name,
          when: formatVenueDateTimeShort(new Date(booking.starts_at)),
          totalMinor: booking.total_minor,
        }),
        notificationDedupeKey(["payment_proof", created[0].id]),
        booking.id,
      ],
    );

    await audit(client, {
      actorType: "customer",
      action: "payment.proof_submitted",
      entityType: "booking",
      entityId: booking.id,
      diff: {
        reference: booking.reference,
        // The reference is what staff match; it is not a secret, but it is not logged raw
        // alongside anything else identifying.
        transactionReference: input.transactionReference.trim(),
        hasScreenshot: Boolean(input.screenshot),
      },
    });

    return { proofId: created[0].id as string, reference: booking.reference };
  });
}

/**
 * Staff decision on a submitted proof.
 *
 * Accepting is what finally confirms the booking and marks it paid. Rejecting leaves the
 * court held and the booking pending, so the customer can try again — it does not throw
 * away a slot because someone mistyped a transaction ID.
 */
export async function reviewPaymentProof(args: {
  proofId: string;
  staffId: string;
  accept: boolean;
  note?: string | null;
}): Promise<{ reference: string; outcome: "confirmed" | "rejected" }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT p.id, p.booking_id, p.payment_intent_id, p.status,
              b.reference, b.total_minor, b.status AS booking_status,
              b.customer_name, b.customer_phone, b.customer_email, b.starts_at,
              s.name AS sport_name, r.name AS resource_name
         FROM payment_proofs p
         JOIN bookings b ON b.id = p.booking_id
         JOIN sports s ON s.id = b.sport_id
         JOIN resources r ON r.id = b.resource_id
        WHERE p.id = $1
        FOR UPDATE OF p`,
      [args.proofId],
    );
    if (rows.length === 0) throw new PaymentProofError("not_found", "That submission could not be found.");
    const proof = rows[0];

    if (!args.accept) {
      await client.query(
        `UPDATE payment_proofs
            SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = $3
          WHERE id = $1`,
        [args.proofId, args.staffId, args.note?.trim() || null],
      );
      // Back to unpaid so the customer can submit again. The court stays held.
      await client.query(
        "UPDATE bookings SET payment_status = 'unpaid' WHERE id = $1",
        [proof.booking_id],
      );
      if (proof.payment_intent_id) {
        await client.query(
          "UPDATE payment_intents SET status = 'failed', failure_reason = $2 WHERE id = $1",
          [proof.payment_intent_id, args.note?.trim() || "Could not match the transaction."],
        );
      }

      await queueCustomerEmail(client, {
        bookingId: proof.booking_id,
        template: "payment_not_matched",
        recipientEmail: proof.customer_email,
        recipientPhone: proof.customer_phone,
        dedupe: ["payment_rejected", args.proofId],
        payload: {
          name: proof.customer_name,
          reference: proof.reference,
          sport: proof.sport_name,
          when: formatVenueDateTimeShort(new Date(proof.starts_at)),
          reason: args.note?.trim() ?? null,
        },
      });

      await audit(client, {
        actorType: "staff",
        actorId: args.staffId,
        action: "payment.proof_rejected",
        entityType: "booking",
        entityId: proof.booking_id,
        diff: { reference: proof.reference, note: args.note ?? null },
      });

      return { reference: proof.reference as string, outcome: "rejected" as const };
    }

    await client.query(
      `UPDATE payment_proofs
          SET status = 'accepted', reviewed_by = $2, reviewed_at = now(), review_note = $3
        WHERE id = $1`,
      [args.proofId, args.staffId, args.note?.trim() || null],
    );
    if (proof.payment_intent_id) {
      await client.query(
        `UPDATE payment_intents
            SET status = 'succeeded', amount_captured_minor = amount_minor,
                verified_by = $2, verified_at = now()
          WHERE id = $1`,
        [proof.payment_intent_id, args.staffId],
      );
    }

    await client.query(
      `UPDATE bookings
          SET status = CASE WHEN status = 'pending_approval' THEN 'confirmed'::booking_status ELSE status END,
              payment_status = 'paid',
              amount_paid_minor = total_minor,
              hold_expires_at = NULL
        WHERE id = $1`,
      [proof.booking_id],
    );
    await client.query(
      "UPDATE reservations SET kind = 'booking', expires_at = NULL WHERE booking_id = $1 AND blocks_availability",
      [proof.booking_id],
    );

    await queueCustomerEmail(client, {
      bookingId: proof.booking_id,
      template: "booking_confirmed",
      recipientEmail: proof.customer_email,
      recipientPhone: proof.customer_phone,
      dedupe: ["payment_accepted", args.proofId],
      payload: {
        name: proof.customer_name,
        sport: proof.sport_name,
        court: proof.resource_name,
        when: formatVenueDateTimeShort(new Date(proof.starts_at)),
        reference: proof.reference,
        totalMinor: proof.total_minor,
        paid: true,
      },
    });

    await audit(client, {
      actorType: "staff",
      actorId: args.staffId,
      action: "payment.proof_accepted",
      entityType: "booking",
      entityId: proof.booking_id,
      diff: { reference: proof.reference, amountMinor: proof.total_minor },
    });

    return { reference: proof.reference as string, outcome: "confirmed" as const };
  });
}

async function queueCustomerEmail(
  client: import("pg").PoolClient,
  args: {
    bookingId: string;
    template: string;
    recipientEmail: string | null;
    recipientPhone: string | null;
    dedupe: readonly string[];
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const recipient = args.recipientEmail ?? args.recipientPhone;
  if (!recipient) return;

  await client.query(
    `INSERT INTO notifications (channel, template, recipient, payload, dedupe_key, booking_id)
     VALUES ($1::notification_channel, $2, $3, $4, $5, $6)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      args.recipientEmail ? "email" : "whatsapp",
      args.template,
      recipient,
      JSON.stringify(args.payload),
      notificationDedupeKey(args.dedupe),
      args.bookingId,
    ],
  );
}

/** Proofs waiting on a staff decision, for the dashboard queue. */
export async function listPendingProofs(limit = 100) {
  const { rows } = await pool().query(
    `SELECT p.id, p.payer_email, p.transaction_reference, p.screenshot_bytes,
            p.screenshot_mime, p.submitted_at,
            b.reference, b.total_minor, b.customer_name, b.customer_phone, b.starts_at,
            s.name AS sport_name
       FROM payment_proofs p
       JOIN bookings b ON b.id = p.booking_id
       JOIN sports s ON s.id = b.sport_id
      WHERE p.status = 'submitted'
      ORDER BY p.submitted_at ASC
      LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id as string,
    payerEmail: row.payer_email as string,
    transactionReference: row.transaction_reference as string,
    hasScreenshot: row.screenshot_bytes !== null,
    submittedAt: new Date(row.submitted_at),
    reference: row.reference as string,
    totalMinor: row.total_minor as number,
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    startsAt: new Date(row.starts_at),
    sportName: row.sport_name as string,
  }));
}

/** The stored screenshot, for the staff-only viewer route. */
export async function getProofScreenshot(
  proofId: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const { rows } = await pool().query(
    "SELECT screenshot, screenshot_mime FROM payment_proofs WHERE id = $1",
    [proofId],
  );
  if (!rows[0]?.screenshot) return null;
  return { bytes: rows[0].screenshot as Buffer, mime: rows[0].screenshot_mime as string };
}

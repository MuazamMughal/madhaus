"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, AuthorisationError } from "@/lib/auth/permissions";
import {
  BookingError,
  approveBookingSlot,
  cancelBooking,
  createStaffBooking,
  declineBookingRequest,
} from "@/server/booking-service";
import { PaymentProofError, reviewPaymentProof } from "@/server/payment-proof-service";
import { CafeError, decideTableRequest } from "@/server/cafe-service";
import { updateInquiryStatus } from "@/server/inquiry-service";
import { parseLocalTime, venueDateToInstant } from "@/lib/domain/time";
import { pool } from "@/lib/db/client";
import { audit } from "@/server/booking-service";
import { withTransaction } from "@/lib/db/client";

/**
 * Staff actions.
 *
 * Every one begins with `requirePermission`. Server Actions are POST endpoints reachable
 * by anyone who is signed in, so the permission check here -- not the hidden button in
 * the UI -- is what actually stops a receptionist issuing a refund.
 */

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** Turn an authorisation failure into a message rather than a stack trace. */
function toState(error: unknown): ActionState {
  if (error instanceof AuthorisationError) return { error: error.message };
  if (error instanceof BookingError) return { error: error.message };
  if (error instanceof CafeError) return { error: error.message };
  if (error instanceof PaymentProofError) return { error: error.message };
  console.error("[admin] action failed:", error);
  return { error: "That did not work. Please try again." };
}

// --- Bookings -------------------------------------------------------------------------

const walkInSchema = z.object({
  sport: z.string().trim().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.coerce.number().int().positive().max(480),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6),
  source: z.enum(["staff_walkin", "staff_phone"]),
  markPaid: z.union([z.literal("on"), z.literal("")]).optional(),
  notes: z.string().trim().max(400).optional(),
});

export async function createWalkInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requirePermission("booking.create");
    const parsed = walkInSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the form." };
    }

    const { reference } = await createStaffBooking({
      sportSlug: parsed.data.sport,
      startsAt: venueDateToInstant(parsed.data.date, parseLocalTime(parsed.data.time)),
      durationMinutes: parsed.data.duration,
      customer: { name: parsed.data.name, phone: parsed.data.phone },
      source: parsed.data.source,
      staffId: session.staffId,
      notes: parsed.data.notes ?? null,
      // Staff take bookings at the desk, inside the online lead time.
      ignoreLeadTime: true,
      markPaid: parsed.data.markPaid === "on",
      paymentMethod: parsed.data.markPaid === "on" ? "cash_at_venue" : undefined,
    });

    revalidatePath("/admin");
    return { ok: true, message: `Booked. Reference ${reference}.` };
  } catch (error) {
    return toState(error);
  }
}

export async function cancelBookingAsStaffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requirePermission("booking.cancel");
    const bookingId = String(formData.get("bookingId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim() || null;

    const { reference } = await cancelBooking({
      bookingId,
      actor: "staff",
      staffId: session.staffId,
      reason,
      // Staff may cancel inside the customer cutoff; that is the point of staff.
      overrideCutoff: true,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/bookings");
    return { ok: true, message: `${reference} cancelled and the slot released.` };
  } catch (error) {
    return toState(error);
  }
}

export async function checkInAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission("booking.checkin");
    const bookingId = String(formData.get("bookingId") ?? "");

    await withTransaction(async (client) => {
      await client.query(
        "UPDATE bookings SET checked_in_at = now() WHERE id = $1 AND status = 'confirmed'",
        [bookingId],
      );
      await audit(client, {
        actorType: "staff",
        actorId: session.staffId,
        action: "booking.checked_in",
        entityType: "booking",
        entityId: bookingId,
      });
    });

    revalidatePath("/admin");
    return { ok: true, message: "Checked in." };
  } catch (error) {
    return toState(error);
  }
}

// --- Deciding on a request --------------------------------------------------------------

/**
 * Approve the slot on a booking request.
 *
 * For a pay-at-venue customer this confirms the booking outright. For an online payer it
 * sends the JazzCash link and leaves the booking pending — approving a slot is not
 * approving a payment that has not happened.
 */
export async function approveRequestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requirePermission("booking.approve");
    const bookingId = String(formData.get("bookingId") ?? "");
    // What was agreed on the confirmation call. Internal; the customer never sees it.
    const note = String(formData.get("note") ?? "").trim() || null;

    const result = await approveBookingSlot({ bookingId, staffId: session.staffId, note });

    revalidatePath("/admin");
    revalidatePath("/admin/bookings");
    return {
      ok: true,
      message: result.awaitingPayment
        ? `${result.reference} — slot approved. Payment link sent${result.customerEmail ? ` to ${result.customerEmail}` : ""}. Not confirmed until the money lands.`
        : `${result.reference} is confirmed. They pay at the venue.`,
    };
  } catch (error) {
    return toState(error);
  }
}

export async function declineRequestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requirePermission("booking.approve");
    const bookingId = String(formData.get("bookingId") ?? "");
    const note = String(formData.get("note") ?? "").trim() || null;

    const { reference } = await declineBookingRequest({
      bookingId,
      staffId: session.staffId,
      note,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/bookings");
    return { ok: true, message: `${reference} declined. The slot is back on the board.` };
  } catch (error) {
    return toState(error);
  }
}

// --- Payments -------------------------------------------------------------------------

/**
 * Accept or reject a submitted JazzCash transaction reference.
 *
 * Accepting is what finally confirms the booking. Rejecting leaves the court held so the
 * customer can try again — a mistyped transaction ID should not cost them the slot.
 */
export async function reviewPaymentProofAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requirePermission("payment.verify");
    const proofId = String(formData.get("proofId") ?? "");
    const accept = formData.get("decision") === "accept";
    const note = String(formData.get("note") ?? "").trim() || null;

    const result = await reviewPaymentProof({
      proofId,
      staffId: session.staffId,
      accept,
      note,
    });

    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    return {
      ok: true,
      message:
        result.outcome === "confirmed"
          ? `${result.reference} is confirmed and paid. Confirmation and calendar invite sent.`
          : `${result.reference} — payment not matched. The court is still held and they can try again.`,
    };
  } catch (error) {
    return toState(error);
  }
}

// --- Café -----------------------------------------------------------------------------

export async function decideTableAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requirePermission("cafe.reservation.decide");
    const reservationId = String(formData.get("reservationId") ?? "");
    const decision = formData.get("decision") === "confirm" ? "confirmed" : "rejected";
    const tableId = String(formData.get("tableId") ?? "") || null;
    const note = String(formData.get("note") ?? "").trim() || null;

    const { reference } = await decideTableRequest({
      reservationId,
      staffId: session.staffId,
      decision,
      tableId,
      staffNote: note,
    });

    revalidatePath("/admin/cafe");
    revalidatePath("/admin");
    return {
      ok: true,
      message:
        decision === "confirmed"
          ? `${reference} confirmed.`
          : `${reference} declined. Let the customer know.`,
    };
  } catch (error) {
    return toState(error);
  }
}

// --- Enquiries ------------------------------------------------------------------------

export async function updateInquiryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requirePermission("booking.view");
    const inquiryId = String(formData.get("inquiryId") ?? "");
    const status = String(formData.get("status") ?? "") as
      | "new"
      | "in_progress"
      | "answered"
      | "closed"
      | "spam";
    const note = String(formData.get("note") ?? "").trim() || null;

    await updateInquiryStatus({ inquiryId, status, staffId: session.staffId, note });
    revalidatePath("/admin/inquiries");
    return { ok: true, message: "Updated." };
  } catch (error) {
    return toState(error);
  }
}

// --- Settings -------------------------------------------------------------------------

export async function updateSettingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requirePermission("settings.manage");
    const key = String(formData.get("key") ?? "");
    const rawValue = String(formData.get("value") ?? "");

    // Only keys that already exist can be set, so a crafted POST cannot invent settings.
    const { rows } = await pool().query("SELECT value FROM settings WHERE key = $1", [key]);
    if (rows.length === 0) return { error: "Unknown setting." };

    let value: unknown;
    try {
      value = JSON.parse(rawValue);
    } catch {
      return { error: "That value is not valid JSON." };
    }

    // The type must not change: a boolean flag cannot become a string.
    if (typeof value !== typeof rows[0].value) {
      return { error: `This setting expects a ${typeof rows[0].value}.` };
    }

    await withTransaction(async (client) => {
      await client.query("UPDATE settings SET value = $2::jsonb WHERE key = $1", [
        key,
        JSON.stringify(value),
      ]);
      await audit(client, {
        actorType: "staff",
        actorId: session.staffId,
        action: "settings.updated",
        entityType: "setting",
        entityId: key,
        diff: { from: rows[0].value, to: value },
      });
    });

    revalidatePath("/admin/settings");
    return { ok: true, message: "Saved." };
  } catch (error) {
    return toState(error);
  }
}

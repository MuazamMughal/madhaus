"use server";

import { headers } from "next/headers";
import { z } from "zod";
import {
  ALLOWED_SCREENSHOT_TYPES,
  MAX_SCREENSHOT_BYTES,
  PaymentProofError,
  submitPaymentProof,
} from "@/server/payment-proof-service";
import { findBookingForPayment } from "@/server/booking-access";
import { checkRateLimit } from "@/server/rate-limit";

const schema = z.object({
  reference: z.string().trim().min(3).max(20),
  token: z.string().trim().min(10).max(200),
  payerEmail: z.string().trim().email("Please enter the email you paid from."),
  transactionReference: z
    .string()
    .trim()
    .min(4, "Please enter the transaction ID from JazzCash.")
    .max(80),
});

export interface PaymentProofState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Submit proof of a JazzCash transfer.
 *
 * This records a CLAIM. It never confirms the booking — only a member of staff who has
 * checked the JazzCash account does that. The response says so, so nobody leaves thinking
 * they are booked.
 */
export async function submitPaymentProofAction(
  _previous: PaymentProofState,
  formData: FormData,
): Promise<PaymentProofState> {
  const forwarded = (await headers()).get("x-forwarded-for") ?? "unknown";
  const ip = forwarded.split(",")[0].trim();

  const limit = await checkRateLimit(`proof:${ip}`, { tokens: 10, windowSeconds: 900 });
  if (!limit.allowed) {
    return { ok: false, error: "Too many attempts. Please wait a few minutes, or call the venue." };
  }

  const parsed = schema.safeParse({
    reference: formData.get("reference"),
    token: formData.get("token"),
    payerEmail: formData.get("payerEmail"),
    transactionReference: formData.get("transactionReference"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  // The payment token only opens this page; it cannot cancel or move a booking.
  const booking = await findBookingForPayment({
    reference: parsed.data.reference,
    token: parsed.data.token,
  });
  if (!booking) return { ok: false, error: "That payment link is not valid." };

  // Screenshot is optional. Validated here AND in the service AND by a CHECK constraint,
  // because a Server Action is a POST endpoint and this form is not the only way in.
  let screenshot: { bytes: Buffer; mime: string } | null = null;
  const file = formData.get("screenshot");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return {
        ok: false,
        error: "Please check the highlighted fields.",
        fieldErrors: { screenshot: "That image is over 2 MB. Try a smaller one." },
      };
    }
    if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type as never)) {
      return {
        ok: false,
        error: "Please check the highlighted fields.",
        fieldErrors: { screenshot: "Please upload a PNG, JPEG or WebP image." },
      };
    }
    screenshot = { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type };
  }

  try {
    await submitPaymentProof({
      bookingId: booking.id,
      payerEmail: parsed.data.payerEmail,
      transactionReference: parsed.data.transactionReference,
      screenshot,
      ip,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof PaymentProofError) {
      return { ok: false, error: error.message };
    }
    console.error("[pay] proof submission failed:", error);
    return { ok: false, error: "We could not record that. Please try again, or call the venue." };
  }
}

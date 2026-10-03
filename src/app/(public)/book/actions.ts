"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createBookingRequest, BookingError, quote } from "@/server/booking-service";
import { InvalidPhoneNumberError, normalisePakistaniPhone } from "@/lib/domain/phone";
import { parseLocalTime, venueDateToInstant } from "@/lib/domain/time";
import { checkRateLimit } from "@/server/rate-limit";
import { headers } from "next/headers";

/**
 * Booking server actions.
 *
 * A Server Action is reachable by a direct POST, not only through the form, so every one
 * of these validates its input from scratch and never trusts a hidden field. In
 * particular the price is recomputed server-side: `expectedTotalMinor` is only ever used
 * to DETECT a mismatch, never to set the amount.
 */

const holdSchema = z.object({
  sport: z.string().trim().min(1).max(40),
  paymentPreference: z.enum(["at_venue", "online"]).default("at_venue"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  start: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time."),
  duration: z.coerce.number().int().positive().max(480),
  name: z.string().trim().min(2, "Please tell us who the booking is for.").max(120),
  phone: z.string().trim().min(6, "We need a phone number to confirm your booking."),
  email: z.union([z.string().trim().email("That email address does not look right."), z.literal("")]),
  partySize: z.union([z.coerce.number().int().min(1).max(40), z.literal("")]).optional(),
  notes: z.string().trim().max(500).optional(),
  couponCode: z.string().trim().max(40).optional(),
  // What the customer was shown. Used to detect a change, never to set the price.
  expectedTotal: z.coerce.number().int().nonnegative().optional(),
});

export interface BookingRequestFormState {
  ok: boolean;
  /** Message to show above the form. */
  error?: string;
  /** Field-level errors, keyed by input name, wired up with aria-describedby. */
  fieldErrors?: Record<string, string>;
}

export async function submitBookingRequestAction(
  _previous: BookingRequestFormState,
  formData: FormData,
): Promise<BookingRequestFormState> {
  // Booking is a public, unauthenticated, write endpoint, so it is rate limited per
  // client before any work happens.
  const forwarded = (await headers()).get("x-forwarded-for") ?? "unknown";
  const limit = await checkRateLimit(`book:${forwarded.split(",")[0].trim()}`, {
    tokens: 10,
    windowSeconds: 600,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      error: "That is a lot of booking attempts in a short time. Please wait a few minutes, or call the venue.",
    };
  }

  const parsed = holdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  const input = parsed.data;

  // Phone normalisation has its own error messages worth showing verbatim.
  try {
    normalisePakistaniPhone(input.phone);
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors: { phone: error.message } };
    }
    throw error;
  }

  const startsAt = venueDateToInstant(input.date, parseLocalTime(input.start));

  let reference: string;
  let token: string;

  try {
    const submitted = await createBookingRequest({
      sportSlug: input.sport,
      startsAt,
      durationMinutes: input.duration,
      customer: {
        name: input.name,
        phone: input.phone,
        email: input.email === "" ? null : input.email,
      },
      partySize: input.partySize === "" || input.partySize === undefined ? null : input.partySize,
      notes: input.notes ?? null,
      couponCode: input.couponCode || null,
      expectedTotalMinor: input.expectedTotal ?? null,
      paymentPreference: input.paymentPreference,
    });
    reference = submitted.reference;
    token = submitted.accessToken;
  } catch (error) {
    if (error instanceof BookingError) {
      // Every one of these is a real thing that happens, and each gets its own wording
      // rather than a generic failure.
      return { ok: false, error: error.message };
    }
    console.error("[book] hold failed:", error);
    return {
      ok: false,
      error: "Something went wrong on our side and nothing has been booked. Please try again.",
    };
  }

  // Straight to the booking page. There is no checkout step any more: the customer has
  // made a request, and the next move belongs to the venue.
  // The token is the credential; the reference alone opens nothing.
  redirect(`/booking/${reference}?t=${encodeURIComponent(token)}&new=1`);
}

/** Live re-quote, used by the checkout page to show the current price. */
export async function quoteAction(input: {
  sport: string;
  date: string;
  start: string;
  duration: number;
  couponCode?: string;
}) {
  const startsAt = venueDateToInstant(input.date, parseLocalTime(input.start));
  return quote({
    sportSlug: input.sport,
    startsAt,
    durationMinutes: input.duration,
    couponCode: input.couponCode ?? null,
  });
}

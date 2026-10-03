"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatPkr } from "@/lib/domain/money";
import { BookingError, cancelBooking, rescheduleBooking } from "@/server/booking-service";
import { cancellationEligibility, findBookingForCustomer } from "@/server/booking-access";
import { parseLocalTime, venueDateToInstant } from "@/lib/domain/time";

const schema = z.object({
  reference: z.string().trim().min(3).max(20),
  token: z.string().trim().min(10).max(200),
  reason: z.string().trim().max(300).optional(),
});

export interface ManageState {
  error?: string;
  success?: string;
}

/**
 * Customer-initiated cancellation.
 *
 * Eligibility is checked here as well as in the UI, because hiding the button is not
 * authorisation. The cutoff comes from the policy snapshot frozen onto the booking, so a
 * customer is judged by the terms they actually agreed to.
 */
export async function cancelBookingAction(
  _previous: ManageState,
  formData: FormData,
): Promise<ManageState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "That request was not valid." };

  const booking = await findBookingForCustomer({
    reference: parsed.data.reference,
    token: parsed.data.token,
  });
  if (!booking) return { error: "We could not find that booking." };

  const eligibility = cancellationEligibility(booking);
  if (!eligibility.eligible) return { error: eligibility.reason };

  try {
    await cancelBooking({
      bookingId: booking.id,
      actor: "customer",
      reason: parsed.data.reason || "Cancelled by the customer.",
    });
  } catch (error) {
    if (error instanceof BookingError) return { error: error.message };
    console.error("[booking] cancel failed:", error);
    return { error: "We could not cancel that just now. Please call the venue." };
  }

  revalidatePath(`/booking/${parsed.data.reference}`);
  return { success: "Your booking has been cancelled. We have sent you a confirmation." };
}


const rescheduleSchema = schema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time."),
});

/**
 * Customer-initiated reschedule.
 *
 * The booking keeps its reference and its access token, so the link the customer already
 * has still opens it. The new time is priced fresh — moving from off-peak into peak costs
 * the difference, and the response says so plainly rather than quietly changing the total.
 */
export async function rescheduleBookingAction(
  _previous: ManageState,
  formData: FormData,
): Promise<ManageState> {
  const parsed = rescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the date and time." };
  }

  const booking = await findBookingForCustomer({
    reference: parsed.data.reference,
    token: parsed.data.token,
  });
  if (!booking) return { error: "We could not find that booking." };

  try {
    const result = await rescheduleBooking({
      bookingId: booking.id,
      startsAt: venueDateToInstant(parsed.data.date, parseLocalTime(parsed.data.time)),
      actor: "customer",
    });

    revalidatePath(`/booking/${parsed.data.reference}`);

    const difference =
      result.differenceMinor === 0
        ? "The price is unchanged."
        : result.differenceMinor > 0
          ? `That slot costs more — there is ${formatPkr(result.differenceMinor)} to settle at the venue.`
          : `That slot costs less. The venue will sort out the ${formatPkr(Math.abs(result.differenceMinor))} difference with you.`;

    return { success: `Moved. ${difference}` };
  } catch (error) {
    if (error instanceof BookingError) return { error: error.message };
    console.error("[booking] reschedule failed:", error);
    return { error: "We could not move that just now. Please call the venue." };
  }
}

"use client";

import { useActionState, useState } from "react";
import {
  cancelBookingAction,
  rescheduleBookingAction,
  type ManageState,
} from "@/app/(public)/booking/[reference]/actions";
import { Button } from "@/components/ui/button";
import type { BookingStatus } from "@/lib/domain/booking-state";

/**
 * What a customer can do with their booking.
 *
 * An ineligible cancellation is shown as a disabled control WITH the reason attached via
 * aria-describedby, rather than hidden. Hiding it leaves someone wondering whether they
 * missed something; saying "that closed 12 hours before the start, please call" answers
 * the question.
 */
export function ManageBooking({
  reference,
  token,
  eligibility,
  rescheduleEligibility,
  status,
  icsHref,
  mapsUrl,
  whatsappUrl,
  phone,
  today,
}: {
  reference: string;
  token: string;
  eligibility: { eligible: boolean; reason: string; cutoffHours: number };
  rescheduleEligibility: { eligible: boolean; reason: string; cutoffHours: number };
  status: BookingStatus;
  icsHref: string;
  mapsUrl: string | null;
  whatsappUrl: string | null;
  phone: string | null;
  today: string;
}) {
  const [state, formAction, pending] = useActionState<ManageState, FormData>(
    cancelBookingAction,
    {},
  );
  const [rescheduleState, rescheduleFormAction, reschedulePending] = useActionState<
    ManageState,
    FormData
  >(rescheduleBookingAction, {});
  const [confirming, setConfirming] = useState(false);
  const [moving, setMoving] = useState(false);

  const isOver = status === "cancelled" || status === "completed" || status === "no_show";

  return (
    <section className="mt-16" data-print-hide="">
      <h2 className="text-eyebrow font-display mb-5 uppercase">Your booking, your call</h2>

      {state.error && (
        <div role="alert" className="mb-6 border-l-4 border-negative bg-charcoal-raised p-4 text-sm">
          <p className="font-semibold text-negative">Could not cancel</p>
          <p className="mt-1 text-grey-200">{state.error}</p>
        </div>
      )}
      {state.success && (
        <div role="status" className="mb-6 border-l-4 border-positive bg-charcoal-raised p-4 text-sm">
          <p className="text-positive">{state.success}</p>
        </div>
      )}
      {rescheduleState.error && (
        <div role="alert" className="mb-6 border-l-4 border-negative bg-charcoal-raised p-4 text-sm">
          <p className="font-semibold text-negative">Could not move it</p>
          <p className="mt-1 text-grey-200">{rescheduleState.error}</p>
        </div>
      )}
      {rescheduleState.success && (
        <div role="status" className="mb-6 border-l-4 border-positive bg-charcoal-raised p-4 text-sm">
          <p className="text-positive">{rescheduleState.success}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!isOver && (
          <a
            href={icsHref}
            className="font-display inline-flex min-h-12 items-center border-2 border-ivory px-6 text-sm uppercase transition hover:bg-ivory hover:text-charcoal"
          >
            Add to calendar
          </a>
        )}

        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-display inline-flex min-h-12 items-center border-2 border-ivory px-6 text-sm uppercase transition hover:bg-ivory hover:text-charcoal"
          >
            Directions
          </a>
        )}

        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-display inline-flex min-h-12 items-center border-2 border-ivory px-6 text-sm uppercase transition hover:bg-ivory hover:text-charcoal"
          >
            Message the venue
          </a>
        )}

        {phone && (
          <a
            href={`tel:${phone}`}
            className="font-display inline-flex min-h-12 items-center border-2 border-ivory px-6 text-sm uppercase transition hover:bg-ivory hover:text-charcoal"
          >
            Call {phone}
          </a>
        )}
      </div>

      {/* Move it. Same reference, new time -- the existing link keeps working. */}
      {!isOver && (
        <div className="mt-8 border-t border-charcoal-line pt-8">
          {rescheduleEligibility.eligible ? (
            moving ? (
              <form action={rescheduleFormAction} className="max-w-md space-y-4">
                <input type="hidden" name="reference" value={reference} />
                <input type="hidden" name="token" value={token} />

                <p className="text-sm">
                  Pick a new time. Your reference stays the same, and the price is worked out
                  again for the new slot.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="new-date" className="text-eyebrow font-display mb-2 block uppercase">
                      New date
                    </label>
                    <input
                      id="new-date"
                      name="date"
                      type="date"
                      min={today}
                      required
                      className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-base focus:border-lime"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-time" className="text-eyebrow font-display mb-2 block uppercase">
                      New time
                    </label>
                    <input
                      id="new-time"
                      name="time"
                      type="time"
                      required
                      className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-base focus:border-lime"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={reschedulePending}>
                    {reschedulePending ? "Moving…" : "Move my booking"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setMoving(false)}>
                    Leave it
                  </Button>
                </div>
                <p className="text-xs text-grey-400">
                  If the new slot is taken, nothing changes and you keep the time you have.
                </p>
              </form>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setMoving(true)}>
                  Change the time
                </Button>
                <p className="mt-3 text-xs text-grey-400">
                  Free to move online up to {rescheduleEligibility.cutoffHours} hours before your
                  session.
                </p>
              </>
            )
          ) : (
            <>
              <span
                aria-disabled="true"
                aria-describedby="move-blocked"
                className="font-display inline-flex min-h-12 cursor-not-allowed items-center border-2 border-grey-400 px-6 text-sm text-grey-400 uppercase"
              >
                Change the time
              </span>
              <p id="move-blocked" className="mt-3 max-w-md text-xs text-grey-300">
                {rescheduleEligibility.reason}
              </p>
            </>
          )}
        </div>
      )}

      {!isOver && (
        <div className="mt-8 border-t border-charcoal-line pt-8">
          {eligibility.eligible ? (
            confirming ? (
              <form action={formAction} className="max-w-md space-y-4">
                <input type="hidden" name="reference" value={reference} />
                <input type="hidden" name="token" value={token} />

                <p className="text-sm">
                  Cancel this booking? The slot goes straight back on the board.
                </p>

                <div>
                  <label htmlFor="cancel-reason" className="text-eyebrow font-display mb-2 block uppercase">
                    Reason <span className="text-grey-400 lowercase">optional</span>
                  </label>
                  <input
                    id="cancel-reason"
                    name="reason"
                    maxLength={300}
                    className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-base focus:border-lime"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" variant="danger" disabled={pending}>
                    {pending ? "Cancelling…" : "Yes, cancel it"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                    Keep my booking
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setConfirming(true)}>
                  Cancel this booking
                </Button>
                <p className="mt-3 text-xs text-grey-400">
                  Free to cancel online up to {eligibility.cutoffHours} hours before your session.
                </p>
              </>
            )
          ) : (
            <>
              <span
                aria-disabled="true"
                aria-describedby="cancel-blocked"
                className="font-display inline-flex min-h-12 cursor-not-allowed items-center border-2 border-grey-400 px-6 text-sm text-grey-400 uppercase"
              >
                Cancel this booking
              </span>
              {/* The reason is what makes a disabled control acceptable. */}
              <p id="cancel-blocked" className="mt-3 max-w-md text-xs text-grey-300">
                {eligibility.reason}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

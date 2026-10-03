"use client";

import { useActionState, useState } from "react";
import { cancelBookingAsStaffAction, checkInAction, type ActionState } from "@/app/admin/actions";
import { ActionFeedback } from "./action-feedback";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/domain/money";
import {
  bookingStatusTone,
  humanBookingStatus,
  humanPaymentStatus,
  type BookingStatus,
  type PaymentStatus,
} from "@/lib/domain/booking-state";
import { formatLocalTime12h, formatVenueDateLong, toVenueWallClock } from "@/lib/domain/time";

interface Entry {
  id: string;
  reference: string;
  sportName: string;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  totalMinor: number;
  amountPaidMinor: number;
  source: string;
  checkedInAt: string | null;
  notes: string | null;
  approvalNote: string | null;
}

/** One booking in the search results, with the actions this role may take on it. */
export function BookingRow({
  entry,
  canCancel,
  canCheckIn,
}: {
  entry: Entry;
  canCancel: boolean;
  canCheckIn: boolean;
}) {
  const [cancelState, cancelAction, cancelPending] = useActionState<ActionState, FormData>(
    cancelBookingAsStaffAction,
    {},
  );
  const [checkInState, checkInFormAction, checkInPending] = useActionState<ActionState, FormData>(
    checkInAction,
    {},
  );
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const startsAt = new Date(entry.startsAt);
  const endsAt = new Date(entry.endsAt);
  const startWall = toVenueWallClock(startsAt);
  const endWall = toVenueWallClock(endsAt);
  const tone = bookingStatusTone(entry.status);

  const toneClasses = {
    positive: "border-positive text-positive",
    pending: "border-pending text-pending",
    negative: "border-negative text-negative",
    neutral: "border-grey-400 text-grey-300",
  }[tone];

  const isActive = entry.status === "confirmed" || entry.status === "pending_approval";

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display" data-numeric="">
            {entry.reference}
            <span
              className={`ml-3 border px-2 py-0.5 text-[10px] uppercase ${toneClasses}`}
            >
              {humanBookingStatus(entry.status)}
            </span>
          </p>
          <p className="mt-1.5 text-sm">
            {entry.customerName}{" "}
            <span className="text-grey-400" data-numeric="">
              · {entry.customerPhone}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-grey-400" data-numeric="">
            {entry.sportName} · {entry.resourceName} · {formatVenueDateLong(startsAt)},{" "}
            {formatLocalTime12h(startWall.hour * 60 + startWall.minute)}–
            {formatLocalTime12h(endWall.hour * 60 + endWall.minute)}
          </p>
          {entry.notes && (
            <p className="mt-2 border-l-2 border-charcoal-line pl-2 text-xs text-grey-300">
              {entry.notes}
            </p>
          )}
          {/* What the venue agreed on the confirmation call. */}
          {entry.approvalNote && (
            <p className="mt-1.5 border-l-2 border-lime pl-2 text-xs text-grey-300">
              <span className="text-lime">Call:</span> {entry.approvalNote}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-lg" data-numeric="">
            {formatPkr(entry.totalMinor)}
          </p>
          <p className="text-xs text-grey-400">{humanPaymentStatus(entry.paymentStatus)}</p>
          {entry.amountPaidMinor > 0 && entry.amountPaidMinor < entry.totalMinor && (
            <p className="text-xs text-pending" data-numeric="">
              {formatPkr(entry.amountPaidMinor)} received
            </p>
          )}
          {entry.checkedInAt && (
            <p className="mt-1 text-xs text-positive">
              <span aria-hidden="true">✓ </span>Checked in
            </p>
          )}
        </div>
      </div>

      {(cancelState.error || cancelState.message || checkInState.error || checkInState.message) && (
        <div className="mt-3">
          <ActionFeedback state={cancelState.error || cancelState.message ? cancelState : checkInState} />
        </div>
      )}

      {isActive && (canCancel || canCheckIn) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {canCheckIn && entry.status === "confirmed" && !entry.checkedInAt && (
            <form action={checkInFormAction}>
              <input type="hidden" name="bookingId" value={entry.id} />
              <Button type="submit" size="sm" variant="secondary" disabled={checkInPending}>
                {checkInPending ? "…" : "Check in"}
              </Button>
            </form>
          )}

          {canCancel &&
            (confirmingCancel ? (
              <form action={cancelAction} className="flex w-full flex-wrap items-end gap-3">
                <input type="hidden" name="bookingId" value={entry.id} />
                <div className="min-w-48 flex-1">
                  <label
                    htmlFor={`reason-${entry.id}`}
                    className="text-eyebrow font-display mb-1.5 block uppercase"
                  >
                    Why?
                  </label>
                  <input
                    id={`reason-${entry.id}`}
                    name="reason"
                    maxLength={300}
                    placeholder="Customer called to cancel"
                    className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
                  />
                </div>
                <Button type="submit" size="sm" variant="danger" disabled={cancelPending}>
                  {cancelPending ? "…" : "Cancel booking"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmingCancel(false)}
                >
                  Keep it
                </Button>
              </form>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setConfirmingCancel(true)}>
                Cancel
              </Button>
            ))}
        </div>
      )}
    </li>
  );
}

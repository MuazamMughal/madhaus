"use client";

import { useActionState, useState } from "react";
import { approveRequestAction, declineRequestAction, type ActionState } from "@/app/admin/actions";
import { ActionFeedback } from "./action-feedback";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/domain/money";
import { formatLocalTime12h, formatVenueDateLong, toVenueWallClock } from "@/lib/domain/time";
import { whatsappClickToChatUrl } from "@/lib/domain/phone";

export interface PendingRequest {
  id: string;
  reference: string;
  sportName: string;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  partySize: number | null;
  notes: string | null;
  totalMinor: number;
  paymentPreference: "at_venue" | "online";
  createdAt: string;
}

/**
 * Requests waiting on a decision.
 *
 * Built around how the venue actually works: somebody rings the customer, confirms the
 * booking on the phone, and only then locks the slot. So the phone number is a tap-to-call
 * link rather than text to copy out, and approving asks what was agreed.
 *
 * The court and time are the largest thing on each row, because that is what staff check
 * against the night before they pick up the phone.
 */
export function RequestQueue({ requests }: { requests: PendingRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="hatch border border-dashed border-charcoal-line p-8 text-center">
        <p className="font-display text-title">Nothing waiting</p>
        <p className="mt-2 text-sm text-grey-400">
          Every booking request has been dealt with.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {requests.map((request) => (
        <RequestRow key={request.id} request={request} />
      ))}
    </ul>
  );
}

function RequestRow({ request }: { request: PendingRequest }) {
  const [approveState, approveAction, approvePending] = useActionState<ActionState, FormData>(
    approveRequestAction,
    {},
  );
  const [declineState, declineAction, declinePending] = useActionState<ActionState, FormData>(
    declineRequestAction,
    {},
  );
  const [declining, setDeclining] = useState(false);
  const [approving, setApproving] = useState(false);

  const settled = approveState.ok || declineState.ok;
  const startsAt = new Date(request.startsAt);
  const endsAt = new Date(request.endsAt);
  const startWall = toVenueWallClock(startsAt);
  const endWall = toVenueWallClock(endsAt);
  const paysOnline = request.paymentPreference === "online";

  if (settled) {
    return (
      <li className="border border-charcoal-line p-5">
        <ActionFeedback state={approveState.ok ? approveState : declineState} />
      </li>
    );
  }

  return (
    <li className="border border-pending p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-lg" data-numeric="">
            {formatVenueDateLong(startsAt)} ·{" "}
            {formatLocalTime12h(startWall.hour * 60 + startWall.minute)}–
            {formatLocalTime12h(endWall.hour * 60 + endWall.minute)}
          </p>
          <p className="mt-1 text-sm">
            <span className="font-semibold">{request.sportName}</span>{" "}
            <span className="text-grey-400">· {request.resourceName}</span>
          </p>
          <p className="mt-2 text-sm font-medium">{request.customerName}</p>

          {/* The venue rings before confirming, so calling is one tap, not a copy-paste. */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <a
              href={`tel:${request.customerPhone}`}
              className="font-display inline-flex min-h-10 items-center gap-2 border-2 border-lime px-4 text-xs text-lime uppercase transition hover:bg-lime hover:text-charcoal"
            >
              <span aria-hidden="true">✆</span>
              <span data-numeric="">{request.customerPhone}</span>
            </a>
            <a
              href={whatsappClickToChatUrl(
                request.customerPhone,
                `Hi ${request.customerName}, this is MadHaus about your booking ${request.reference}.`,
              )}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-grey-300 underline decoration-2 underline-offset-4 hover:text-ivory"
            >
              WhatsApp
            </a>
            {request.customerEmail && (
              <a
                href={`mailto:${request.customerEmail}`}
                className="text-xs text-grey-300 underline decoration-2 underline-offset-4 hover:text-ivory"
              >
                {request.customerEmail}
              </a>
            )}
          </div>
          {request.partySize && (
            <p className="mt-0.5 text-sm text-grey-400">{request.partySize} playing</p>
          )}
          {request.notes && (
            <p className="mt-2 border-l-2 border-charcoal-line pl-2 text-sm text-grey-300">
              {request.notes}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-xl" data-numeric="">
            {formatPkr(request.totalMinor)}
          </p>
          <p
            className={`mt-1 border px-2 py-0.5 text-[10px] uppercase ${
              paysOnline ? "border-lime text-lime" : "border-grey-400 text-grey-300"
            }`}
          >
            {paysOnline ? "Paying online" : "Pays at venue"}
          </p>
          <p className="mt-1 font-display text-[10px] text-grey-400" data-numeric="">
            {request.reference}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-charcoal-line pt-5">
        <ActionFeedback state={approveState.error ? approveState : declineState} />

        {approving ? (
          <form action={approveAction} className="mt-2 space-y-4">
            <input type="hidden" name="bookingId" value={request.id} />
            <p className="text-sm">
              {paysOnline
                ? "Confirm the court is free. The customer gets a JazzCash link — it stays unconfirmed until the money lands."
                : "Confirm the court is free and you have spoken to the customer. This locks the slot."}
            </p>
            <div>
              <label
                htmlFor={`call-${request.id}`}
                className="text-eyebrow font-display mb-2 block uppercase"
              >
                What was agreed on the call?{" "}
                <span className="text-grey-400 lowercase">optional, internal</span>
              </label>
              <input
                id={`call-${request.id}`}
                name="note"
                maxLength={300}
                placeholder="Spoke to Ayesha, confirmed 8pm, bringing 3 others"
                className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" size="sm" disabled={approvePending}>
                {approvePending
                  ? "Confirming…"
                  : paysOnline
                    ? "Approve & send payment link"
                    : "Confirm the booking"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setApproving(false)}>
                Back
              </Button>
            </div>
          </form>
        ) : declining ? (
          <form action={declineAction} className="mt-2 space-y-4">
            <input type="hidden" name="bookingId" value={request.id} />
            <div>
              <label
                htmlFor={`note-${request.id}`}
                className="text-eyebrow font-display mb-2 block uppercase"
              >
                Why? <span className="text-grey-400 lowercase">the customer sees this</span>
              </label>
              <input
                id={`note-${request.id}`}
                name="note"
                maxLength={300}
                placeholder="That court is already taken by a walk-in"
                className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" size="sm" variant="danger" disabled={declinePending}>
                {declinePending ? "Declining…" : "Decline and free the slot"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setDeclining(false)}>
                Back
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => setApproving(true)}>
              {paysOnline ? "Approve & send payment link" : "Confirm the booking"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDeclining(true)}>
              Decline
            </Button>
            <p className="text-xs text-grey-400">
              {paysOnline
                ? "Ring them first. Approving sends the JazzCash link; it stays unconfirmed until the payment is verified."
                : "Ring them to confirm, then lock the slot."}
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

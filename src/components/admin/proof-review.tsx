"use client";

import { useActionState, useState } from "react";
import { reviewPaymentProofAction, type ActionState } from "@/app/admin/actions";
import { ActionFeedback } from "./action-feedback";
import { Button } from "@/components/ui/button";

/**
 * Accept or reject a submitted JazzCash transaction reference.
 *
 * Accepting is the moment the booking becomes confirmed and paid, so it asks twice and
 * restates the amount. Rejecting is deliberately gentler — the court stays held and the
 * customer can resubmit, because a mistyped transaction ID should not cost them the slot.
 */
export function ProofReview({
  proofId,
  reference,
  amountLabel,
  transactionReference,
}: {
  proofId: string;
  reference: string;
  amountLabel: string;
  transactionReference: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    reviewPaymentProofAction,
    {},
  );
  const [deciding, setDeciding] = useState<"accept" | "reject" | null>(null);

  if (state.ok) return <ActionFeedback state={state} />;

  return (
    <div className="space-y-4">
      <ActionFeedback state={state} />

      {deciding === null ? (
        <div className="flex flex-wrap gap-3">
          <Button size="sm" onClick={() => setDeciding("accept")}>
            Payment received
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDeciding("reject")}>
            Cannot find it
          </Button>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="proofId" value={proofId} />
          <input type="hidden" name="decision" value={deciding} />

          <p className="text-sm">
            {deciding === "accept" ? (
              <>
                Confirm <strong>{amountLabel}</strong> arrived against transaction{" "}
                <strong data-numeric="">{transactionReference}</strong>? This confirms{" "}
                <strong data-numeric="">{reference}</strong> and emails the customer their
                calendar invite.
              </>
            ) : (
              <>
                Cannot match <strong data-numeric="">{transactionReference}</strong>? The court
                stays held and the customer is asked to check and send it again.
              </>
            )}
          </p>

          <div>
            <label htmlFor={`note-${proofId}`} className="text-eyebrow font-display mb-2 block uppercase">
              Note {deciding === "reject" && <span className="text-grey-400 lowercase">the customer sees this</span>}
            </label>
            <input
              id={`note-${proofId}`}
              name="note"
              maxLength={300}
              placeholder={
                deciding === "accept"
                  ? "Matched on the statement"
                  : "No transfer with that ID has reached us"
              }
              className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              size="sm"
              variant={deciding === "accept" ? "primary" : "danger"}
              disabled={pending}
            >
              {pending
                ? "Saving…"
                : deciding === "accept"
                  ? "Yes, confirm the booking"
                  : "Yes, ask them to resend"}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

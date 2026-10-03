"use client";

import { useActionState, useState } from "react";
import { decideTableAction, type ActionState } from "@/app/admin/actions";
import { ActionFeedback } from "./action-feedback";
import { Button } from "@/components/ui/button";
import { formatVenueDateTimeShort } from "@/lib/domain/time";

/** Accept or decline a table request, optionally allocating a specific table. */
export function TableRequestRow({
  request,
  tables,
}: {
  request: {
    id: string;
    reference: string;
    customerName: string;
    customerPhone: string;
    partySize: number;
    startsAt: string;
    notes: string | null;
  };
  tables: Array<{ id: string; label: string; seats: number }>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(decideTableAction, {});
  const [deciding, setDeciding] = useState<"confirm" | "reject" | null>(null);

  if (state.ok) {
    return (
      <li className="border border-charcoal-line p-5">
        <ActionFeedback state={state} />
      </li>
    );
  }

  // Tables that can actually seat this party. Offering a two-top to a party of six
  // would just produce a mistake at the door.
  const suitable = tables.filter((table) => table.seats >= request.partySize);

  return (
    <li className="border border-charcoal-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-display" data-numeric="">
            {request.reference}
          </p>
          <p className="mt-1 text-sm">
            {request.customerName}{" "}
            <span className="text-grey-400" data-numeric="">
              · {request.customerPhone}
            </span>
          </p>
          <p className="mt-1 text-sm text-grey-400">
            {request.partySize} {request.partySize === 1 ? "person" : "people"} ·{" "}
            {formatVenueDateTimeShort(new Date(request.startsAt))}
          </p>
          {request.notes && (
            <p className="mt-2 border-l-2 border-charcoal-line pl-2 text-sm text-grey-300">
              {request.notes}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-charcoal-line pt-4">
        <ActionFeedback state={state} />

        {deciding === null ? (
          <div className="mt-2 flex flex-wrap gap-3">
            <Button size="sm" onClick={() => setDeciding("confirm")}>
              Accept
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDeciding("reject")}>
              Decline
            </Button>
          </div>
        ) : (
          <form action={formAction} className="mt-2 space-y-4">
            <input type="hidden" name="reservationId" value={request.id} />
            <input type="hidden" name="decision" value={deciding} />

            {deciding === "confirm" && suitable.length > 0 && (
              <div>
                <label
                  htmlFor={`table-${request.id}`}
                  className="text-eyebrow font-display mb-2 block uppercase"
                >
                  Table <span className="text-grey-400 lowercase">optional</span>
                </label>
                <select
                  id={`table-${request.id}`}
                  name="tableId"
                  className="min-h-11 w-full max-w-xs border border-charcoal-line bg-transparent px-3 text-sm"
                >
                  <option value="" className="bg-charcoal">Decide on the night</option>
                  {suitable.map((table) => (
                    <option key={table.id} value={table.id} className="bg-charcoal">
                      {table.label} ({table.seats} seats)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor={`note-${request.id}`}
                className="text-eyebrow font-display mb-2 block uppercase"
              >
                Note to the customer <span className="text-grey-400 lowercase">optional</span>
              </label>
              <input
                id={`note-${request.id}`}
                name="note"
                maxLength={300}
                className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                size="sm"
                variant={deciding === "confirm" ? "primary" : "danger"}
                disabled={pending}
              >
                {pending ? "Saving…" : deciding === "confirm" ? "Confirm the table" : "Decline"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setDeciding(null)}>
                Back
              </Button>
            </div>
          </form>
        )}
      </div>
    </li>
  );
}

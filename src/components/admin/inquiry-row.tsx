"use client";

import { useActionState } from "react";
import { updateInquiryAction, type ActionState } from "@/app/admin/actions";
import { ActionFeedback } from "./action-feedback";
import { formatVenueDateTimeShort } from "@/lib/domain/time";
import { whatsappClickToChatUrl } from "@/lib/domain/phone";

const KIND_LABELS: Record<string, string> = {
  general: "General",
  private_event: "Private event",
  group_booking: "Group booking",
  corporate: "Corporate",
  feedback: "Feedback",
};

export function InquiryRow({
  inquiry,
}: {
  inquiry: {
    id: string;
    reference: string;
    kind: string;
    status: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
    subject: string | null;
    message: string;
    createdAt: string;
    staffNote: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateInquiryAction,
    {},
  );

  return (
    <li className="border border-charcoal-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display">
            <span data-numeric="">{inquiry.reference}</span>
            <span className="ml-3 border border-charcoal-line px-2 py-0.5 text-[10px] uppercase">
              {KIND_LABELS[inquiry.kind] ?? inquiry.kind}
            </span>
          </p>
          <p className="mt-1.5 text-sm">
            {inquiry.customerName}{" "}
            <span className="text-grey-400" data-numeric="">
              · {inquiry.customerPhone}
            </span>
          </p>
          {inquiry.subject && <p className="mt-1 text-sm font-medium">{inquiry.subject}</p>}
          <p className="mt-2 max-w-2xl text-sm whitespace-pre-wrap text-grey-200">
            {inquiry.message}
          </p>
          {inquiry.staffNote && (
            <p className="mt-3 border-l-2 border-lime pl-2 text-xs text-grey-300">
              Staff note: {inquiry.staffNote}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right text-xs text-grey-400">
          <p>{formatVenueDateTimeShort(new Date(inquiry.createdAt))}</p>
          <div className="mt-3 flex flex-col gap-2">
            <a
              href={whatsappClickToChatUrl(inquiry.customerPhone, `Hi ${inquiry.customerName}, `)}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-lime decoration-2 underline-offset-4"
            >
              Reply on WhatsApp
            </a>
            {inquiry.customerEmail && (
              <a
                href={`mailto:${inquiry.customerEmail}`}
                className="underline decoration-lime decoration-2 underline-offset-4"
              >
                Email
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-charcoal-line pt-4">
        <ActionFeedback state={state} />

        <form action={formAction} className="mt-2 flex flex-wrap items-end gap-3">
          <input type="hidden" name="inquiryId" value={inquiry.id} />

          <div>
            <label
              htmlFor={`status-${inquiry.id}`}
              className="text-eyebrow font-display mb-1.5 block uppercase"
            >
              Status
            </label>
            <select
              id={`status-${inquiry.id}`}
              name="status"
              defaultValue={inquiry.status}
              className="min-h-10 border border-charcoal-line bg-transparent px-3 text-sm"
            >
              {["new", "in_progress", "answered", "closed", "spam"].map((value) => (
                <option key={value} value={value} className="bg-charcoal">
                  {value.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-48 flex-1">
            <label
              htmlFor={`note-${inquiry.id}`}
              className="text-eyebrow font-display mb-1.5 block uppercase"
            >
              Note <span className="text-grey-400 lowercase">optional</span>
            </label>
            <input
              id={`note-${inquiry.id}`}
              name="note"
              maxLength={300}
              className="min-h-10 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="font-display min-h-10 border-2 border-ivory px-4 text-xs uppercase"
          >
            {pending ? "…" : "Update"}
          </button>
        </form>
      </div>
    </li>
  );
}

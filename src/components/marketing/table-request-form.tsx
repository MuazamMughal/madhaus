"use client";

import { useActionState } from "react";
import { requestTableAction, type TableRequestState } from "@/app/(public)/cafe/actions";
import { Button } from "@/components/ui/button";

/**
 * Table request form.
 *
 * The heading says "Request a table", the button says "Send request", and the success
 * message says the venue will confirm. None of that is decoration: until the venue tells
 * us how many tables it has, this genuinely is a request and the copy must not imply
 * otherwise.
 */
export function TableRequestForm({
  instantConfirm,
  today,
  openFrom,
  openTo,
}: {
  instantConfirm: boolean;
  today: string;
  openFrom: string;
  openTo: string;
}) {
  const [state, formAction, pending] = useActionState<TableRequestState, FormData>(
    requestTableAction,
    { ok: false },
  );

  if (state.ok) {
    return (
      <div role="status" className="border-l-4 border-[var(--surface-accent)] bg-[var(--surface-raised)] p-6">
        <p className="font-display text-title">
          {state.awaitingApproval ? "Request sent" : "Table booked"}
        </p>
        <p className="mt-3 text-sm">
          {state.awaitingApproval
            ? "We have passed this to the venue. They will come back to you to confirm — until they do, it is not a booking."
            : "Your table is confirmed. See you soon."}
        </p>
        <p className="mt-4 text-sm">
          Reference{" "}
          <span className="font-display" data-numeric="">
            {state.reference}
          </span>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && (
        <div role="alert" className="border-l-4 border-negative bg-[var(--surface-raised)] p-4 text-sm">
          <p className="font-semibold">Could not send that</p>
          <p className="mt-1">{state.error}</p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="Name" required autoComplete="name" error={state.fieldErrors?.name} />
        <Field
          name="phone"
          label="Mobile"
          type="tel"
          required
          autoComplete="tel"
          placeholder="0300 1234567"
          error={state.fieldErrors?.phone}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          name="partySize"
          label="How many?"
          type="number"
          min={1}
          max={40}
          defaultValue={2}
          required
          error={state.fieldErrors?.partySize}
        />
        <Field
          name="date"
          label="Date"
          type="date"
          min={today}
          defaultValue={today}
          required
          error={state.fieldErrors?.date}
        />
        <Field
          name="time"
          label="Time"
          type="time"
          defaultValue="20:00"
          required
          hint={`Open ${openFrom}–${openTo}`}
          error={state.fieldErrors?.time}
        />
      </div>

      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        hint="Optional."
        error={state.fieldErrors?.email}
      />

      <Field
        name="notes"
        label="Anything we should know?"
        multiline
        hint="Optional. A birthday, a high chair, somewhere quieter."
        error={state.fieldErrors?.notes}
      />

      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : instantConfirm ? "Book a table" : "Send request"}
      </Button>

      {!instantConfirm && (
        <p className="text-xs text-[var(--surface-muted)]">
          This sends a request, not a booking. The venue will confirm before your table is held.
        </p>
      )}
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  multiline = false,
  required = false,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  multiline?: boolean;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const className = `min-h-12 w-full border bg-transparent px-3 py-2 text-base ${
    error ? "border-negative" : "border-[var(--surface-line)] focus:border-[var(--surface-accent)]"
  }`;

  return (
    <div>
      <label htmlFor={name} className="text-eyebrow font-display mb-2 block uppercase">
        {label}
        {!required && <span className="ml-2 text-[var(--surface-muted)] lowercase">optional</span>}
      </label>
      {multiline ? (
        <textarea
          id={name}
          name={name}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={className}
        />
      ) : (
        <input
          id={name}
          name={name}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={className}
          {...rest}
        />
      )}
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-[var(--surface-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-semibold text-negative">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}

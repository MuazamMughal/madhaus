"use client";

import { useActionState, useState } from "react";
import {
  submitPaymentProofAction,
  type PaymentProofState,
} from "@/app/(public)/booking/[reference]/pay/actions";
import { Button } from "@/components/ui/button";

/**
 * Transaction reference, and optionally a screenshot.
 *
 * The success message is careful: it says the venue will check it, not that the booking is
 * confirmed. Nothing on this page confirms anything — a person at the venue does.
 */
export function PaymentProofForm({
  reference,
  token,
  alreadySubmitted,
}: {
  reference: string;
  token: string;
  alreadySubmitted: boolean;
}) {
  const [state, formAction, pending] = useActionState<PaymentProofState, FormData>(
    submitPaymentProofAction,
    { ok: false },
  );
  const [fileName, setFileName] = useState<string | null>(null);

  if (state.ok || alreadySubmitted) {
    return (
      <div role="status" className="border-l-4 border-pending bg-charcoal-raised p-6">
        <p className="font-display text-title text-pending">With the venue now</p>
        <p className="mt-3 text-sm text-grey-200">
          We have your transaction details and someone is checking them against our JazzCash
          account. Your court stays held while we do.
        </p>
        <p className="mt-3 text-sm text-grey-200">
          This is <strong>not confirmed yet</strong> — we will email you the moment it is, with
          your calendar invite.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <div role="alert" className="border-l-4 border-negative bg-charcoal-raised p-4 text-sm">
          <p className="font-semibold text-negative">Could not record that</p>
          <p className="mt-1 text-grey-200">{state.error}</p>
        </div>
      )}

      <Field
        name="payerEmail"
        label="Email you paid from"
        type="email"
        required
        autoComplete="email"
        hint="So we can match it if the JazzCash name is different."
        error={state.fieldErrors?.payerEmail}
      />

      <Field
        name="transactionReference"
        label="JazzCash transaction ID"
        required
        hint="The TID or reference number on your JazzCash receipt."
        error={state.fieldErrors?.transactionReference}
      />

      <div>
        <label htmlFor="screenshot" className="text-eyebrow font-display mb-2 block uppercase">
          Screenshot <span className="text-grey-400 lowercase">optional</span>
        </label>
        <input
          id="screenshot"
          name="screenshot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          aria-describedby="screenshot-hint screenshot-error"
          className="block w-full text-sm file:mr-4 file:min-h-11 file:cursor-pointer file:border-0 file:bg-lime file:px-4 file:font-semibold file:text-charcoal"
        />
        <p id="screenshot-hint" className="mt-1.5 text-xs text-grey-400">
          PNG, JPEG or WebP, up to 2 MB. Helps us find it faster.
          {fileName && <span className="ml-2 text-ivory">{fileName}</span>}
        </p>
        {state.fieldErrors?.screenshot && (
          <p id="screenshot-error" className="mt-1.5 text-xs font-semibold text-negative">
            <span aria-hidden="true">⚠ </span>
            {state.fieldErrors.screenshot}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "I have paid — tell the venue"}
      </Button>
      <p className="text-xs text-grey-400">
        Sending this does not confirm your booking. A member of staff checks the payment
        against our account first, and you will hear from us either way.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  required = false,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={name} className="text-eyebrow font-display mb-2 block uppercase">
        {label}
        {!required && <span className="ml-2 text-grey-400 lowercase">optional</span>}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-12 w-full border bg-transparent px-3 py-2 text-base ${
          error ? "border-negative" : "border-charcoal-line focus:border-lime"
        }`}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-grey-400">
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

"use client";

import { useActionState } from "react";
import { submitInquiryAction, type ContactState } from "@/app/(public)/contact/actions";
import { Button } from "@/components/ui/button";

const KINDS = [
  { value: "general", label: "General question" },
  { value: "private_event", label: "Private event" },
  { value: "group_booking", label: "Group booking" },
  { value: "corporate", label: "Corporate" },
  { value: "feedback", label: "Feedback" },
] as const;

/** Contact form. Errors are tied to inputs; success replaces the form with a receipt. */
export function ContactForm({ defaultKind = "general" }: { defaultKind?: string }) {
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    submitInquiryAction,
    { ok: false },
  );

  if (state.ok) {
    return (
      <div role="status" className="border-l-4 border-lime bg-charcoal-raised p-6">
        <p className="font-display text-title">Message sent</p>
        <p className="mt-3 text-sm text-grey-200">
          The venue has it and will come back to you. Keep your reference handy:{" "}
          <span className="font-display text-ivory" data-numeric="">
            {state.reference}
          </span>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && (
        <div role="alert" className="border-l-4 border-negative bg-charcoal-raised p-4 text-sm">
          <p className="font-semibold text-negative">Could not send that</p>
          <p className="mt-1 text-grey-200">{state.error}</p>
        </div>
      )}

      {/*
        Honeypot. Hidden from sight AND from assistive technology, and never autofilled,
        so only a script fills it in.
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="kind" className="text-eyebrow font-display mb-2 block uppercase">
          What is this about?
        </label>
        <select
          id="kind"
          name="kind"
          defaultValue={defaultKind}
          className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-base focus:border-lime"
        >
          {KINDS.map((kind) => (
            <option key={kind.value} value={kind.value} className="bg-charcoal">
              {kind.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="Your name" required autoComplete="name" error={state.fieldErrors?.name} />
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

      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        hint="Optional, but handy if you would rather be emailed back."
        error={state.fieldErrors?.email}
      />

      <Field name="subject" label="Subject" hint="Optional." error={state.fieldErrors?.subject} />

      <Field
        name="message"
        label="Message"
        multiline
        required
        rows={5}
        error={state.fieldErrors?.message}
      />

      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Send message"}
      </Button>
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
  rows = 3,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  multiline?: boolean;
  required?: boolean;
  rows?: number;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const className = `min-h-12 w-full border bg-transparent px-3 py-2 text-base ${
    error ? "border-negative" : "border-charcoal-line focus:border-lime"
  }`;

  return (
    <div>
      <label htmlFor={name} className="text-eyebrow font-display mb-2 block uppercase">
        {label}
        {!required && <span className="ml-2 text-grey-400 lowercase">optional</span>}
      </label>
      {multiline ? (
        <textarea
          id={name}
          name={name}
          rows={rows}
          required={required}
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

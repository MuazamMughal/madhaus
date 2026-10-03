"use client";

import { useActionState, useState } from "react";
import {
  submitBookingRequestAction,
  type BookingRequestFormState,
} from "@/app/(public)/book/actions";
import { Button } from "@/components/ui/button";

/**
 * Customer details form.
 *
 * Errors are associated with their inputs through aria-describedby and aria-invalid, and
 * the summary at the top is a live region, so a screen-reader user hears what went wrong
 * rather than being silently returned to an unchanged page.
 *
 * Booking without an account is the default path: a name and a phone number is all it
 * takes. Email is optional and says why it is worth giving.
 */

const initialState: BookingRequestFormState = { ok: false };

export function DetailsForm({
  sport,
  date,
  start,
  duration,
  expectedTotalMinor,
  onlinePaymentAvailable,
}: {
  sport: string;
  date: string;
  start: string;
  duration: number;
  expectedTotalMinor: number;
  /** False when the venue has not set up JazzCash details. */
  onlinePaymentAvailable: boolean;
}) {
  const [state, formAction, pending] = useActionState(submitBookingRequestAction, initialState);
  const [paymentPreference, setPaymentPreference] = useState<"at_venue" | "online">("at_venue");

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {/* Carried through so a direct POST cannot book a different slot than the one
          shown. The server re-validates every one of these regardless. */}
      <input type="hidden" name="sport" value={sport} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="duration" value={duration} />
      {/* Used ONLY to detect a price change between quote and submit. The server
          recomputes the real amount and refuses if these disagree. */}
      <input type="hidden" name="expectedTotal" value={expectedTotalMinor} />

      {/* Announced on failure. role="alert" so it interrupts. */}
      {state.error && (
        <div
          role="alert"
          className="border-l-4 border-negative bg-charcoal-raised p-4 text-sm"
        >
          <p className="font-semibold text-negative">Could not hold that slot</p>
          <p className="mt-1 text-grey-200">{state.error}</p>
        </div>
      )}

      <Field
        name="name"
        label="Your name"
        autoComplete="name"
        required
        error={state.fieldErrors?.name}
      />

      <Field
        name="phone"
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        placeholder="0300 1234567"
        hint="We will use this to confirm your booking."
        error={state.fieldErrors?.phone}
      />

      <Field
        name="email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        hint="Optional. Add it and we will email your booking details and a calendar invite."
        error={state.fieldErrors?.email}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          name="partySize"
          label="How many playing?"
          type="number"
          inputMode="numeric"
          min={1}
          max={40}
          hint="Optional."
          error={state.fieldErrors?.partySize}
        />
        <Field
          name="couponCode"
          label="Promo code"
          hint="Optional."
          error={state.fieldErrors?.couponCode}
        />
      </div>

      <Field
        name="notes"
        label="Anything we should know?"
        multiline
        hint="Optional. Equipment, accessibility needs, a birthday."
        error={state.fieldErrors?.notes}
      />

      {/* How they want to pay. Pay at the venue is the default and the common case. */}
      <fieldset className="border-t border-charcoal-line pt-6">
        <legend className="text-eyebrow font-display mb-4 uppercase">How will you pay?</legend>
        <div className="space-y-3">
          <label
            className={`flex cursor-pointer gap-3 border p-4 transition-colors ${
              paymentPreference === "at_venue" ? "border-lime" : "border-charcoal-line hover:border-grey-400"
            }`}
          >
            <input
              type="radio"
              name="paymentPreference"
              value="at_venue"
              checked={paymentPreference === "at_venue"}
              onChange={() => setPaymentPreference("at_venue")}
              className="mt-0.5 size-5 shrink-0 accent-lime"
            />
            <span>
              <span className="block text-sm font-semibold">Pay at the venue</span>
              <span className="mt-1 block text-sm text-grey-300">
                Cash or card when you arrive. Nothing to do now.
              </span>
            </span>
          </label>

          {onlinePaymentAvailable && (
            <label
              className={`flex cursor-pointer gap-3 border p-4 transition-colors ${
                paymentPreference === "online" ? "border-lime" : "border-charcoal-line hover:border-grey-400"
              }`}
            >
              <input
                type="radio"
                name="paymentPreference"
                value="online"
                checked={paymentPreference === "online"}
                onChange={() => setPaymentPreference("online")}
                className="mt-0.5 size-5 shrink-0 accent-lime"
              />
              <span>
                <span className="block text-sm font-semibold">Pay online by JazzCash</span>
                <span className="mt-1 block text-sm text-grey-300">
                  We will send you a payment link once the venue confirms your slot. Do not send
                  anything before then.
                </span>
              </span>
            </label>
          )}
        </div>
      </fieldset>

      <div className="border-t border-charcoal-line pt-6">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Sending your request…" : "Send booking request"}
        </Button>
        {/* The single most important sentence on the page. */}
        <p className="mt-3 text-xs text-grey-400">
          This is a request, not a confirmed booking. We hold the slot while the venue checks
          it against the night&apos;s other bookings, and you will hear from us either way.
        </p>
      </div>
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
  // Both are referenced, so the hint is not lost when an error appears.
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
          rows={3}
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
          {/* Not colour alone: the wording and the icon carry it too. */}
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}

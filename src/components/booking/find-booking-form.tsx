"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Open a booking from its reference and token.
 *
 * Both are required, because the reference alone is quotable over the phone and must not
 * be a credential. The form just builds the URL — the server does the real check and
 * answers identically whether the reference is wrong or the token is.
 */
export function FindBookingForm() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [token, setToken] = useState("");

  const ready = reference.trim().length >= 5 && token.trim().length >= 10;

  return (
    <form
      action="/booking"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        router.push(
          `/booking/${encodeURIComponent(reference.trim().toUpperCase())}?t=${encodeURIComponent(token.trim())}`,
        );
      }}
      className="space-y-5"
    >
      <div>
        <label htmlFor="reference" className="text-eyebrow font-display mb-2 block uppercase">
          Booking reference
        </label>
        <input
          id="reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="MH-7F3K2Q9X"
          className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-base focus:border-lime"
          data-numeric=""
        />
      </div>

      <div>
        <label htmlFor="token" className="text-eyebrow font-display mb-2 block uppercase">
          Access code
        </label>
        <input
          id="token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-base focus:border-lime"
          aria-describedby="token-hint"
        />
        <p id="token-hint" className="mt-1.5 text-xs text-grey-400">
          The long code at the end of your confirmation link, after <code>?t=</code>.
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={!ready}>
        Open my booking
      </Button>
    </form>
  );
}

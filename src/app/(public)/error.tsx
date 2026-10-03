"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Error boundary.
 *
 * Says what the customer needs to know -- nothing was charged, nothing was booked -- and
 * gives them a way forward. The digest is shown because it is what the venue needs to
 * find the error in the logs; the error message itself is not, since it can leak
 * internals.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <section data-surface="dark" className="surface py-24 sm:py-32">
      <div className="shell shell-content text-center">
        <p className="text-eyebrow font-display mb-6 text-negative uppercase">Something broke</p>
        <h1 className="text-display mx-auto max-w-[18ch]">
          That did not <span className="text-lime">work.</span>
        </h1>
        <p className="text-lead mx-auto mt-6 max-w-lg text-grey-300">
          Something went wrong on our side. Nothing has been booked and nothing has been charged.
          Try again, and if it keeps happening, give the venue a call.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={reset} size="lg">
            Try again
          </Button>
          <ButtonLink href="/contact" size="lg" variant="secondary">
            Contact the venue
          </ButtonLink>
        </div>

        {error.digest && (
          <p className="mt-10 text-xs text-grey-400">
            Reference for the venue:{" "}
            <span className="font-mono" data-numeric="">
              {error.digest}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

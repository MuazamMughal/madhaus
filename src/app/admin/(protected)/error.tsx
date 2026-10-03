"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Dashboard error boundary.
 *
 * Its main job is the 403: someone signed in, with a role that cannot do what they tried.
 * That is a normal thing to happen in a venue where reception, the arena manager and the
 * café manager all share a dashboard, and it deserves a readable explanation rather than
 * a stack trace.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] error:", error);
  }, [error]);

  // AuthorisationError's message is written for a person to read, so it is shown as-is.
  // Anything else could carry internals, so it is not.
  const isPermissionProblem = error.name === "AuthorisationError";

  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="text-eyebrow font-display mb-4 text-pending uppercase">
        {isPermissionProblem ? "Not allowed" : "Something went wrong"}
      </p>
      <h1 className="text-headline">
        {isPermissionProblem ? "You cannot do that" : "That did not work"}
      </h1>
      <p className="mt-6 text-grey-300">
        {isPermissionProblem
          ? error.message
          : "Something failed on our side. Nothing has been changed. Try again, and tell whoever looks after the system if it keeps happening."}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <a
          href="/admin"
          className="font-display inline-flex min-h-12 items-center border-2 border-ivory px-6 text-sm uppercase transition hover:bg-ivory hover:text-charcoal"
        >
          Back to tonight
        </a>
      </div>

      {error.digest && (
        <p className="mt-10 text-xs text-grey-400">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}

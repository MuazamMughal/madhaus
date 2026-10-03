"use client";

import type { ActionState } from "@/app/admin/actions";

/**
 * Feedback for a staff action.
 *
 * Errors use role="alert" so they interrupt; successes use role="status" so they are
 * announced without stealing focus mid-task.
 */
export function ActionFeedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <div role="alert" className="border-l-4 border-negative bg-charcoal-raised p-3 text-sm">
        <span aria-hidden="true">⚠ </span>
        {state.error}
      </div>
    );
  }
  if (state.message) {
    return (
      <div role="status" className="border-l-4 border-positive bg-charcoal-raised p-3 text-sm">
        <span aria-hidden="true">✓ </span>
        {state.message}
      </div>
    );
  }
  return null;
}

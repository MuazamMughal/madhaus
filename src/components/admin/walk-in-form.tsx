"use client";

import { useActionState, useState } from "react";
import { createWalkInAction, type ActionState } from "@/app/admin/actions";
import { ActionFeedback } from "./action-feedback";
import { Button } from "@/components/ui/button";

/** Staff booking form. Durations change with the sport, because they differ per sport. */
export function WalkInForm({
  sports,
  durationsBySport,
  defaultDate,
  today,
}: {
  sports: Array<{ slug: string; name: string }>;
  durationsBySport: Record<string, number[]>;
  defaultDate: string;
  today: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createWalkInAction,
    {},
  );
  const [sport, setSport] = useState(sports[0]?.slug ?? "");

  const durations = durationsBySport[sport] ?? [60];

  if (sports.length === 0) {
    return (
      <p className="border border-dashed border-charcoal-line p-6 text-sm text-grey-300">
        No sports are active, so there is nothing to book. Activate one in the database first.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <ActionFeedback state={state} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="sport" className="text-eyebrow font-display mb-2 block uppercase">
            Sport
          </label>
          <select
            id="sport"
            name="sport"
            value={sport}
            onChange={(event) => setSport(event.target.value)}
            className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-sm"
          >
            {sports.map((entry) => (
              <option key={entry.slug} value={entry.slug} className="bg-charcoal">
                {entry.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="duration" className="text-eyebrow font-display mb-2 block uppercase">
            Length
          </label>
          <select
            id="duration"
            name="duration"
            className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-sm"
          >
            {durations.map((duration) => (
              <option key={duration} value={duration} className="bg-charcoal">
                {duration >= 60 ? `${duration / 60} hr${duration > 60 ? "s" : ""}` : `${duration} min`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="date" className="text-eyebrow font-display mb-2 block uppercase">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={defaultDate}
            min={today}
            required
            className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
          />
        </div>

        <div>
          <label htmlFor="time" className="text-eyebrow font-display mb-2 block uppercase">
            Start time
          </label>
          <input
            id="time"
            name="time"
            type="time"
            defaultValue="20:00"
            required
            className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
          />
          <p className="mt-1.5 text-xs text-grey-400">
            Times after midnight belong to the night before.
          </p>
        </div>

        <div>
          <label htmlFor="name" className="text-eyebrow font-display mb-2 block uppercase">
            Customer name
          </label>
          <input
            id="name"
            name="name"
            required
            className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
          />
        </div>

        <div>
          <label htmlFor="phone" className="text-eyebrow font-display mb-2 block uppercase">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="0300 1234567"
            className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
          />
        </div>
      </div>

      <div>
        <label htmlFor="source" className="text-eyebrow font-display mb-2 block uppercase">
          Taken
        </label>
        <select
          id="source"
          name="source"
          className="min-h-12 w-full max-w-xs border border-charcoal-line bg-transparent px-3 text-sm"
        >
          <option value="staff_walkin" className="bg-charcoal">At the desk</option>
          <option value="staff_phone" className="bg-charcoal">Over the phone</option>
        </select>
      </div>

      <div>
        <label htmlFor="notes" className="text-eyebrow font-display mb-2 block uppercase">
          Notes <span className="text-grey-400 lowercase">optional</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="w-full border border-charcoal-line bg-transparent px-3 py-2 text-sm focus:border-lime"
        />
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="markPaid" className="size-5 accent-lime" />
        Paid in cash now
      </label>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Booking…" : "Create booking"}
      </Button>
    </form>
  );
}

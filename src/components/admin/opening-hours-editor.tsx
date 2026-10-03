"use client";

import { useActionState, useState } from "react";
import { saveOpeningHoursAction, type ConfigState } from "@/app/admin/config-actions";
import { ActionFeedback } from "./action-feedback";
import { Button } from "@/components/ui/button";
import type { OpeningHoursRow } from "@/server/venue-config-service";

/**
 * Opening hours, one row per weekday.
 *
 * Each day saves on its own, so changing Friday cannot accidentally rewrite the rest of
 * the week. "Closes next day" is not asked for — the server works it out from the two
 * times, because asking staff to tick that box is asking them to understand the schema.
 */
export function OpeningHoursEditor({ hours }: { hours: OpeningHoursRow[] }) {
  return (
    <ul className="divide-y divide-charcoal-line border-y border-charcoal-line">
      {hours.map((day) => (
        <DayRow key={day.dayOfWeek} day={day} />
      ))}
    </ul>
  );
}

function DayRow({ day }: { day: OpeningHoursRow }) {
  const [state, formAction, pending] = useActionState<ConfigState, FormData>(
    saveOpeningHoursAction,
    {},
  );
  const [editing, setEditing] = useState(false);
  const [closed, setClosed] = useState(day.isClosed);
  const [opensAt, setOpensAt] = useState(day.opensAt);
  const [closesAt, setClosesAt] = useState(day.closesAt);

  // Mirrors the server's rule, so the hint matches what will actually be saved.
  const wrapsMidnight = !closed && closesAt <= opensAt;

  if (!editing) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div>
          <p className="font-medium">{day.dayName}</p>
          <p className="mt-1 text-sm text-grey-400" data-numeric="">
            {day.label}
            {!day.isClosed && day.closesNextDay && (
              <span className="ml-2 text-xs text-grey-500">(past midnight)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {!day.isClosed && (
            <span className="text-sm text-grey-400" data-numeric="">
              {day.openHours}h
            </span>
          )}
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="py-5">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="dayOfWeek" value={day.dayOfWeek} />

        <div className="flex flex-wrap items-end gap-4">
          <p className="font-display min-w-24 text-title">{day.dayName}</p>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="isClosed"
              checked={closed}
              onChange={(event) => setClosed(event.target.checked)}
              className="size-5 accent-lime"
            />
            Closed all day
          </label>
        </div>

        {!closed && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor={`opens-${day.dayOfWeek}`}
                className="text-eyebrow font-display mb-2 block uppercase"
              >
                Opens
              </label>
              <input
                id={`opens-${day.dayOfWeek}`}
                name="opensAt"
                type="time"
                value={opensAt}
                onChange={(event) => setOpensAt(event.target.value)}
                required
                className="min-h-11 border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
              />
            </div>
            <div>
              <label
                htmlFor={`closes-${day.dayOfWeek}`}
                className="text-eyebrow font-display mb-2 block uppercase"
              >
                Closes
              </label>
              <input
                id={`closes-${day.dayOfWeek}`}
                name="closesAt"
                type="time"
                value={closesAt}
                onChange={(event) => setClosesAt(event.target.value)}
                required
                className="min-h-11 border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
              />
            </div>
            {wrapsMidnight && (
              <p className="pb-3 text-xs text-lime">
                Runs past midnight — the night is treated as one trading day.
              </p>
            )}
          </div>
        )}

        {closed && (
          <>
            <input type="hidden" name="opensAt" value={opensAt} />
            <input type="hidden" name="closesAt" value={closesAt} />
          </>
        )}

        <ActionFeedback state={state} />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(false);
              setClosed(day.isClosed);
              setOpensAt(day.opensAt);
              setClosesAt(day.closesAt);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </li>
  );
}

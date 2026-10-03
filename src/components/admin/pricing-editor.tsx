"use client";

import { useActionState, useState } from "react";
import {
  deletePricingRuleAction,
  savePricingRuleAction,
  type ConfigState,
} from "@/app/admin/config-actions";
import { ActionFeedback } from "./action-feedback";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/domain/money";
import type { PricingRuleRow } from "@/server/venue-config-service";

const DAYS = [
  { value: 0, short: "Sun" },
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
];

/**
 * Court rate bands.
 *
 * Rates are entered in rupees, because that is what staff think in; the server converts
 * to minor units. Priority is explained in plain words rather than left as a number
 * whose meaning you have to infer.
 */
export function PricingEditor({
  rules,
  sports,
}: {
  rules: PricingRuleRow[];
  sports: Array<{ id: string; name: string }>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const bySport = new Map<string, PricingRuleRow[]>();
  for (const rule of rules) {
    const key = rule.sportName ?? "All sports";
    bySport.set(key, [...(bySport.get(key) ?? []), rule]);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-title">
          {rules.length} rate{rules.length === 1 ? "" : "s"}
        </h2>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            + Add a rate
          </Button>
        )}
      </div>

      {adding && (
        <div className="border-2 border-lime p-5">
          <h3 className="font-display mb-4 text-sm uppercase">New rate</h3>
          <RuleForm sports={sports} onDone={() => setAdding(false)} />
        </div>
      )}

      {[...bySport.entries()].map(([sportName, sportRules]) => (
        <section key={sportName}>
          <h3 className="text-eyebrow font-display mb-3 uppercase">{sportName}</h3>
          <ul className="divide-y divide-charcoal-line border-y border-charcoal-line">
            {sportRules.map((rule) =>
              editing === rule.id ? (
                <li key={rule.id} className="py-5">
                  <RuleForm rule={rule} sports={sports} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <li key={rule.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {rule.label}
                      {rule.isPeak && (
                        <span className="font-display ml-3 border border-orange px-2 py-0.5 text-[10px] text-orange uppercase">
                          Peak
                        </span>
                      )}
                      {!rule.isActive && (
                        <span className="font-display ml-2 border border-grey-400 px-2 py-0.5 text-[10px] text-grey-400 uppercase">
                          Off
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-grey-400" data-numeric="">
                      {rule.startsAtLabel} – {rule.endsAtLabel}
                      {rule.wrapsMidnight && (
                        <span className="ml-2 text-xs text-grey-500">(runs past midnight)</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-grey-400">
                      {rule.daysOfWeek.length === 0
                        ? "Every day"
                        : rule.daysOfWeek.map((d) => DAYS[d].short).join(", ")}
                      {rule.priority > 0 && ` · wins over rates with a lower priority (${rule.priority})`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <p className="font-display text-lg" data-numeric="">
                      {formatPkr(rule.rateMinorPerHour)}
                      <span className="text-sm text-grey-400">/hr</span>
                    </p>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(rule.id)}>
                      Edit
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}

      {rules.length === 0 && (
        <div className="hatch border border-dashed border-charcoal-line p-10 text-center">
          <p className="font-display text-title">No rates set</p>
          <p className="mt-2 text-sm text-grey-400">
            Until at least one rate covers your opening hours, nobody can book a court.
          </p>
        </div>
      )}
    </div>
  );
}

function RuleForm({
  rule,
  sports,
  onDone,
}: {
  rule?: PricingRuleRow;
  sports: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ConfigState, FormData>(
    savePricingRuleAction,
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ConfigState, FormData>(
    deletePricingRuleAction,
    {},
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (state.ok || deleteState.ok) {
    return (
      <div className="space-y-3">
        <ActionFeedback state={state.ok ? state : deleteState} />
        <Button size="sm" variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ActionFeedback state={state.error ? state : deleteState} />

      <form action={formAction} className="space-y-4">
        {rule && <input type="hidden" name="id" value={rule.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="label"
            label="Name"
            defaultValue={rule?.label}
            placeholder="Weekend prime time"
            required
          />
          <div>
            <label htmlFor={`sport-${rule?.id ?? "new"}`} className="text-eyebrow font-display mb-2 block uppercase">
              Applies to
            </label>
            <select
              id={`sport-${rule?.id ?? "new"}`}
              name="sportId"
              defaultValue={rule?.sportId ?? ""}
              className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm"
            >
              <option value="" className="bg-charcoal">Every sport</option>
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id} className="bg-charcoal">
                  {sport.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            name="startsAtLocal"
            label="From"
            type="time"
            defaultValue={rule?.startsAtLocal ?? "17:00"}
            required
          />
          <Field
            name="endsAtLocal"
            label="Until"
            type="time"
            defaultValue={rule?.endsAtLocal ?? "20:00"}
            required
            hint="An earlier time means it runs past midnight."
          />
          <Field
            name="rate"
            label="Rate per hour (Rs)"
            inputMode="decimal"
            defaultValue={rule ? String(rule.rateMinorPerHour / 100) : ""}
            placeholder="3000"
            required
          />
        </div>

        <fieldset>
          <legend className="text-eyebrow font-display mb-2 uppercase">
            Days <span className="text-grey-400 lowercase">leave all unticked for every day</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <label
                key={day.value}
                className="flex min-h-10 cursor-pointer items-center gap-2 border border-charcoal-line px-3 text-xs has-checked:border-lime has-checked:text-lime"
              >
                <input
                  type="checkbox"
                  name="daysOfWeek"
                  value={day.value}
                  defaultChecked={rule?.daysOfWeek.includes(day.value)}
                  className="size-4 accent-lime"
                />
                {day.short}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="priority"
            label="Priority"
            type="number"
            min={0}
            max={1000}
            defaultValue={String(rule?.priority ?? 0)}
            hint="When two rates cover the same minute, the higher number wins."
          />
          <div className="flex flex-col justify-end gap-3 pb-1">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="isPeak"
                defaultChecked={rule?.isPeak}
                className="size-5 accent-lime"
              />
              Show as peak pricing
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={rule ? rule.isActive : true}
                className="size-5 accent-lime"
              />
              In use
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-charcoal-line pt-4">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : rule ? "Save changes" : "Add rate"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>

      {rule && (
        <div className="border-t border-charcoal-line pt-4">
          {confirmingDelete ? (
            <form action={deleteAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={rule.id} />
              <p className="text-sm">Remove this rate for good?</p>
              <Button type="submit" size="sm" variant="danger" disabled={deletePending}>
                {deletePending ? "Removing…" : "Yes, remove it"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-xs text-grey-400 underline underline-offset-4 hover:text-negative"
            >
              Remove this rate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  hint,
  required = false,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <div>
      <label htmlFor={name} className="text-eyebrow font-display mb-2 block uppercase">
        {label}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        aria-describedby={hintId}
        className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
        {...rest}
      />
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-grey-400">
          {hint}
        </p>
      )}
    </div>
  );
}

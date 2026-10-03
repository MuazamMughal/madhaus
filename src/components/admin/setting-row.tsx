"use client";

import { useActionState } from "react";
import { updateSettingAction, type ActionState } from "@/app/admin/actions";
import { ActionFeedback } from "./action-feedback";

/**
 * One setting.
 *
 * Booleans get a real toggle; numbers get a number input. The value is JSON-encoded on
 * the way to the server, which re-checks that the type has not changed — a boolean flag
 * cannot be turned into a string by a crafted POST.
 */
export function SettingRow({
  settingKey,
  value,
  description,
}: {
  settingKey: string;
  value: unknown;
  description: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateSettingAction,
    {},
  );

  const isBoolean = typeof value === "boolean";
  const isNumber = typeof value === "number";
  const label = settingKey.split(".").slice(1).join(".") || settingKey;

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{humanise(label)}</p>
          {description && <p className="mt-1 text-xs text-grey-400">{description}</p>}
          <p className="mt-1 font-mono text-[10px] text-grey-500">{settingKey}</p>
        </div>

        <form action={formAction} className="flex shrink-0 items-center gap-2">
          <input type="hidden" name="key" value={settingKey} />

          {isBoolean ? (
            <>
              <input type="hidden" name="value" value={JSON.stringify(!value)} />
              <button
                type="submit"
                disabled={pending}
                aria-pressed={value}
                className={`font-display flex min-h-10 items-center border-2 px-4 text-xs uppercase transition ${
                  value
                    ? "border-positive text-positive"
                    : "border-grey-400 text-grey-400"
                }`}
              >
                <span aria-hidden="true">{value ? "✓ " : "• "}</span>
                {value ? "On" : "Off"}
                <span className="sr-only">
                  — press to turn {value ? "off" : "on"}
                </span>
              </button>
            </>
          ) : (
            <>
              <label htmlFor={`v-${settingKey}`} className="sr-only">
                {humanise(label)}
              </label>
              <input
                id={`v-${settingKey}`}
                name="value"
                type={isNumber ? "number" : "text"}
                defaultValue={isNumber ? String(value) : JSON.stringify(value)}
                className="min-h-10 w-28 border border-charcoal-line bg-transparent px-2 text-sm focus:border-lime"
              />
              <button
                type="submit"
                disabled={pending}
                className="font-display min-h-10 border-2 border-ivory px-3 text-xs uppercase"
              >
                {pending ? "…" : "Save"}
              </button>
            </>
          )}
        </form>
      </div>

      {(state.error || state.message) && (
        <div className="mt-3">
          <ActionFeedback state={state} />
        </div>
      )}
    </li>
  );
}

/** "holdMinutes" -> "Hold minutes" */
function humanise(value: string): string {
  const spaced = value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\./g, " · ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { CafeError, requestTable } from "@/server/cafe-service";
import { InvalidPhoneNumberError } from "@/lib/domain/phone";
import { checkRateLimit } from "@/server/rate-limit";

const schema = z.object({
  name: z.string().trim().min(2, "Please tell us who the table is for.").max(120),
  phone: z.string().trim().min(6, "We need a phone number to confirm."),
  email: z.union([z.string().trim().email("That email address does not look right."), z.literal("")]),
  partySize: z.coerce.number().int().min(1, "At least one.").max(40, "For groups over 40, please call."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time."),
  notes: z.string().trim().max(400).optional(),
});

export interface TableRequestState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  reference?: string;
  awaitingApproval?: boolean;
}

/**
 * Request a table.
 *
 * Returns a state rather than redirecting: the confirmation is short enough to show in
 * place, and it matters that the wording distinguishes a request from a reservation.
 */
export async function requestTableAction(
  _previous: TableRequestState,
  formData: FormData,
): Promise<TableRequestState> {
  const forwarded = (await headers()).get("x-forwarded-for") ?? "unknown";
  const limit = await checkRateLimit(`table:${forwarded.split(",")[0].trim()}`, {
    tokens: 6,
    windowSeconds: 600,
  });
  if (!limit.allowed) {
    return { ok: false, error: "Too many requests just now. Please wait a few minutes or call the venue." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  try {
    const result = await requestTable({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email === "" ? null : parsed.data.email,
      partySize: parsed.data.partySize,
      date: parsed.data.date,
      time: parsed.data.time,
      notes: parsed.data.notes ?? null,
    });

    return {
      ok: true,
      reference: result.reference,
      awaitingApproval: result.awaitingApproval,
    };
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors: { phone: error.message } };
    }
    if (error instanceof CafeError) {
      return { ok: false, error: error.message };
    }
    console.error("[cafe] table request failed:", error);
    return { ok: false, error: "We could not send that request. Please try again or call the venue." };
  }
}

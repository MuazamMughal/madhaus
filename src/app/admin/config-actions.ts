"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorisationError, requirePermission } from "@/lib/auth/permissions";
import {
  ConfigError,
  deleteMenuItem,
  deletePricingRule,
  saveMenuItem,
  saveOpeningHours,
  savePricingRule,
  setMenuItemAvailability,
} from "@/server/venue-config-service";

/**
 * Configuration actions: rates, opening hours, menu.
 *
 * These decide what customers are charged and when the venue is open, so each one begins
 * with `requirePermission`. A Server Action is a POST endpoint any signed-in user can aim
 * at, and hiding a form from reception is presentation, not authorisation.
 *
 * Prices arrive as rupees because that is what staff think in, and are converted to minor
 * units here — the one place the conversion happens on the way in.
 */

export interface ConfigState {
  ok?: boolean;
  error?: string;
  message?: string;
}

function toState(error: unknown): ConfigState {
  if (error instanceof AuthorisationError) return { error: error.message };
  if (error instanceof ConfigError) return { error: error.message };
  if (error instanceof RangeError) return { error: error.message };
  console.error("[admin:config] action failed:", error);
  return { error: "That did not save. Please try again." };
}

/** Rupees in, paisa out. Rejects more than two decimal places rather than rounding. */
const rupeeAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount in rupees, e.g. 3000 or 3000.50")
  .transform((value) => Math.round(Number.parseFloat(value) * 100));

const timeOfDay = z.string().regex(/^\d{2}:\d{2}$/, "Enter a time as HH:MM.");

// --- Pricing ---------------------------------------------------------------------------

const pricingSchema = z.object({
  id: z.string().trim().optional(),
  label: z.string().trim().min(2, "Give the rate a name.").max(80),
  sportId: z.string().trim().optional(),
  startsAtLocal: timeOfDay,
  endsAtLocal: timeOfDay,
  rate: rupeeAmount,
  isPeak: z.union([z.literal("on"), z.literal("")]).optional(),
  isActive: z.union([z.literal("on"), z.literal("")]).optional(),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function savePricingRuleAction(
  _previous: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  try {
    const session = await requirePermission("pricing.manage");
    const parsed = pricingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the form." };
    }

    // Checkbox groups arrive as repeated entries, not a single value.
    const daysOfWeek = formData
      .getAll("daysOfWeek")
      .map((value) => Number(value))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

    await savePricingRule({
      id: parsed.data.id || null,
      label: parsed.data.label,
      sportId: parsed.data.sportId || null,
      daysOfWeek,
      startsAtLocal: parsed.data.startsAtLocal,
      endsAtLocal: parsed.data.endsAtLocal,
      rateMinorPerHour: parsed.data.rate,
      isPeak: parsed.data.isPeak === "on",
      priority: parsed.data.priority,
      isActive: parsed.data.isActive === "on",
      staffId: session.staffId,
    });

    revalidatePath("/admin/pricing");
    return {
      ok: true,
      message: parsed.data.id
        ? "Rate updated. Bookings already made keep the price they were quoted."
        : "Rate added.",
    };
  } catch (error) {
    return toState(error);
  }
}

export async function deletePricingRuleAction(
  _previous: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  try {
    const session = await requirePermission("pricing.manage");
    await deletePricingRule(String(formData.get("id") ?? ""), session.staffId);
    revalidatePath("/admin/pricing");
    return { ok: true, message: "Rate removed." };
  } catch (error) {
    return toState(error);
  }
}

// --- Opening hours ---------------------------------------------------------------------

const hoursSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  opensAt: timeOfDay,
  closesAt: timeOfDay,
  isClosed: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveOpeningHoursAction(
  _previous: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  try {
    const session = await requirePermission("schedule.manage");
    const parsed = hoursSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the times." };
    }

    const { closesNextDay } = await saveOpeningHours({
      dayOfWeek: parsed.data.dayOfWeek,
      opensAt: parsed.data.opensAt,
      closesAt: parsed.data.closesAt,
      isClosed: parsed.data.isClosed === "on",
      staffId: session.staffId,
    });

    revalidatePath("/admin/schedule");
    revalidatePath("/book");
    return {
      ok: true,
      message: parsed.data.isClosed === "on"
        ? "Saved — closed that day."
        : closesNextDay
          ? "Saved. That day runs past midnight, which is handled."
          : "Saved.",
    };
  } catch (error) {
    return toState(error);
  }
}

// --- Menu --------------------------------------------------------------------------------

const menuSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Give the item a name.").max(120),
  category: z.string().trim().min(2, "Give the item a category.").max(60),
  price: rupeeAmount,
  isAvailable: z.union([z.literal("on"), z.literal("")]).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export async function saveMenuItemAction(
  _previous: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  try {
    const session = await requirePermission("menu.manage");
    const parsed = menuSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the form." };
    }

    await saveMenuItem({
      id: parsed.data.id || null,
      name: parsed.data.name,
      category: parsed.data.category,
      basePriceMinor: parsed.data.price,
      isAvailable: parsed.data.isAvailable === "on",
      sortOrder: parsed.data.sortOrder,
      staffId: session.staffId,
    });

    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    return { ok: true, message: parsed.data.id ? "Item updated." : "Item added to the menu." };
  } catch (error) {
    return toState(error);
  }
}

/** One click, because this is the change a kitchen makes most often. */
export async function toggleMenuAvailabilityAction(
  _previous: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  try {
    const session = await requirePermission("menu.manage");
    const isAvailable = formData.get("isAvailable") === "true";

    const { name } = await setMenuItemAvailability({
      id: String(formData.get("id") ?? ""),
      isAvailable,
      staffId: session.staffId,
    });

    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    return {
      ok: true,
      message: isAvailable ? `${name} is back on.` : `${name} marked sold out.`,
    };
  } catch (error) {
    return toState(error);
  }
}

export async function deleteMenuItemAction(
  _previous: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  try {
    const session = await requirePermission("menu.manage");
    await deleteMenuItem(String(formData.get("id") ?? ""), session.staffId);
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    return { ok: true, message: "Item removed." };
  } catch (error) {
    return toState(error);
  }
}

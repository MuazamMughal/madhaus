"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uploadMenuPhoto } from "@/server/menu-images";
import { MENU_STATUSES, validateMenuPrice } from "@/lib/domain/menu";
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
  id: z.union([z.string().uuid(), z.literal("")]).optional(),
  name: z.string().trim().min(2, "Give the item a name.").max(120),
  category: z.string().trim().min(2, "Give the item a category.").max(60),
  price: z.union([z.literal(""), rupeeAmount]).transform(value => value === "" ? null : value),
  isAvailable: z.literal("on").optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  description: z.string().trim().max(1000).default(""),
  dietaryTags: z.string().trim().max(500).default(""),
  allergenNote: z.string().trim().max(1000).default(""),
  imageAlt: z.string().trim().max(160).default(""),
  removeImage: z.literal("on").optional(),
  isFeatured: z.literal("on").optional(),
  publicationStatus: z.enum(MENU_STATUSES).default("draft"),
});

const variantSchema = z.array(z.object({
  id: z.union([z.string().uuid(), z.literal("")]).transform(value => value || undefined),
  name: z.string().trim().min(1, "Give each size a name.").max(60),
  price: rupeeAmount,
})).max(20);

function refreshMenu() {
  for (const path of ["/admin/menu", "/menu", "/cafe", "/"]) revalidatePath(path);
}

export async function saveMenuItemAction(
  _previous: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  try {
    const session = await requirePermission("menu.manage");
    const parsed = menuSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
    const input = parsed.data;
    validateMenuPrice(input.price, input.publicationStatus);
    const names = formData.getAll("variantName");
    const prices = formData.getAll("variantPrice");
    const ids = formData.getAll("variantId");
    const variants = variantSchema.safeParse(names.map((name,index) => ({
      name, price: prices[index], id: ids[index] ?? "",
    })));
    if (!variants.success) return { error: variants.error.issues[0]?.message ?? "Check the sizes." };
    const file = formData.get("photo");
    if (input.removeImage && file instanceof File && file.size) {
      return { error: "Choose either a replacement photo or Remove photo." };
    }
    const image = file instanceof File && file.size
      ? await uploadMenuPhoto(file, input.imageAlt)
      : input.removeImage ? null : undefined;
    await saveMenuItem({
      id: input.id || null, name: input.name, category: input.category,
      basePriceMinor: input.price, isAvailable: input.isAvailable === "on",
      sortOrder: input.sortOrder, staffId: session.staffId,
      description: input.description, dietaryTags: [...new Set(input.dietaryTags.split(",").map(tag => tag.trim()).filter(Boolean))],
      allergenNote: input.allergenNote, image, imageAlt: input.imageAlt,
      isFeatured: input.isFeatured === "on", publicationStatus: input.publicationStatus,
      variants: variants.data.map(v => ({ id: v.id, name: v.name, priceMinor: v.price })),
    });
    refreshMenu();
    return { ok: true, message: input.publicationStatus === "published"
      ? "Saved and published to the menu." : `Saved as ${input.publicationStatus}.` };
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

    refreshMenu();
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
    refreshMenu();
    return { ok: true, message: "Item archived. It is hidden from the public menu and kept in your records." };
  } catch (error) {
    return toState(error);
  }
}

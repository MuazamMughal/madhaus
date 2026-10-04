import { pool, withTransaction } from "@/lib/db/client";
import { validateMenuPrice, type MenuPhoto, type MenuStatus, type MenuVariant } from "@/lib/domain/menu";
import { audit } from "./booking-service";
import { assertRuleWindowSane } from "@/lib/domain/pricing";
import { formatLocalTime12h, parseLocalTime } from "@/lib/domain/time";

/**
 * Venue configuration the staff own: court rates, opening hours, and the menu.
 *
 * Everything here is deliberately writable from the dashboard rather than by a developer,
 * because these are the things a venue changes without warning — a price goes up, they
 * close for Eid, the kitchen runs out of wings.
 *
 * Two rules run through all of it:
 *
 *   - **Changes are audited.** Who changed a price, from what to what, and when. These
 *     are the settings that decide what customers are charged, so "it used to be 3000"
 *     needs an answer.
 *   - **Existing bookings are never re-priced.** Every booking carries a frozen
 *     `pricing_snapshot`. Changing a rate affects what is quoted from now on, and nothing
 *     that has already been agreed.
 */

export class ConfigError extends Error {
  readonly code: "invalid" | "not_found" | "in_use";
  constructor(code: ConfigError["code"], message: string) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

// --- Pricing ---------------------------------------------------------------------------

export interface PricingRuleRow {
  id: string;
  label: string;
  sportId: string | null;
  sportName: string | null;
  daysOfWeek: number[];
  startsAtLocal: string;
  endsAtLocal: string;
  startsAtLabel: string;
  endsAtLabel: string;
  rateMinorPerHour: number;
  isPeak: boolean;
  priority: number;
  isActive: boolean;
  /** True when the window runs past midnight, which is normal at this venue. */
  wrapsMidnight: boolean;
}

export async function listPricingRules(): Promise<PricingRuleRow[]> {
  const { rows } = await pool().query(
    `SELECT p.id, p.label, p.sport_id, p.days_of_week, p.starts_at_local, p.ends_at_local,
            p.rate_minor_per_hour, p.is_peak, p.priority, p.is_active, s.name AS sport_name
       FROM pricing_rules p
       LEFT JOIN sports s ON s.id = p.sport_id
      ORDER BY s.sort_order NULLS FIRST, p.priority DESC, p.starts_at_local`,
  );
  return rows.map((row) => {
    const start = parseLocalTime(row.starts_at_local);
    const end = parseLocalTime(row.ends_at_local);
    return {
      id: row.id,
      label: row.label,
      sportId: row.sport_id,
      sportName: row.sport_name,
      daysOfWeek: row.days_of_week,
      startsAtLocal: String(row.starts_at_local).slice(0, 5),
      endsAtLocal: String(row.ends_at_local).slice(0, 5),
      startsAtLabel: formatLocalTime12h(start),
      endsAtLabel: formatLocalTime12h(end),
      rateMinorPerHour: row.rate_minor_per_hour,
      isPeak: row.is_peak,
      priority: row.priority,
      isActive: row.is_active,
      wrapsMidnight: end <= start,
    };
  });
}

export interface SavePricingRuleInput {
  id?: string | null;
  label: string;
  sportId: string | null;
  daysOfWeek: number[];
  startsAtLocal: string;
  endsAtLocal: string;
  rateMinorPerHour: number;
  isPeak: boolean;
  priority: number;
  isActive: boolean;
  staffId: string;
}

export async function savePricingRule(input: SavePricingRuleInput): Promise<{ id: string }> {
  const start = parseLocalTime(input.startsAtLocal);
  const end = parseLocalTime(input.endsAtLocal);
  assertRuleWindowSane(start, end);

  if (input.rateMinorPerHour < 0) {
    throw new ConfigError("invalid", "A rate cannot be negative.");
  }
  if (input.label.trim().length < 2) {
    throw new ConfigError("invalid", "Give the rate a name so staff can recognise it.");
  }
  if (input.daysOfWeek.some((day) => day < 0 || day > 6)) {
    throw new ConfigError("invalid", "Days must be between Sunday and Saturday.");
  }

  return withTransaction(async (client) => {
    if (input.id) {
      const { rows: before } = await client.query(
        "SELECT label, rate_minor_per_hour, is_active FROM pricing_rules WHERE id = $1",
        [input.id],
      );
      if (before.length === 0) throw new ConfigError("not_found", "That rate no longer exists.");

      await client.query(
        `UPDATE pricing_rules
            SET label = $2, sport_id = $3, days_of_week = $4::integer[],
                starts_at_local = $5, ends_at_local = $6, rate_minor_per_hour = $7,
                is_peak = $8, priority = $9, is_active = $10
          WHERE id = $1`,
        [
          input.id,
          input.label.trim(),
          input.sportId,
          `{${input.daysOfWeek.join(",")}}`,
          input.startsAtLocal,
          input.endsAtLocal,
          input.rateMinorPerHour,
          input.isPeak,
          input.priority,
          input.isActive,
        ],
      );

      await audit(client, {
        actorType: "staff",
        actorId: input.staffId,
        action: "pricing.updated",
        entityType: "pricing_rule",
        entityId: input.id,
        diff: {
          label: input.label.trim(),
          rateFrom: before[0].rate_minor_per_hour,
          rateTo: input.rateMinorPerHour,
          activeFrom: before[0].is_active,
          activeTo: input.isActive,
        },
      });

      return { id: input.id };
    }

    const { rows } = await client.query(
      `INSERT INTO pricing_rules (label, sport_id, days_of_week, starts_at_local, ends_at_local,
                                  rate_minor_per_hour, is_peak, priority, is_active)
       VALUES ($1,$2,$3::integer[],$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        input.label.trim(),
        input.sportId,
        `{${input.daysOfWeek.join(",")}}`,
        input.startsAtLocal,
        input.endsAtLocal,
        input.rateMinorPerHour,
        input.isPeak,
        input.priority,
        input.isActive,
      ],
    );

    await audit(client, {
      actorType: "staff",
      actorId: input.staffId,
      action: "pricing.created",
      entityType: "pricing_rule",
      entityId: rows[0].id,
      diff: { label: input.label.trim(), rateMinorPerHour: input.rateMinorPerHour },
    });

    return { id: rows[0].id as string };
  });
}

export async function deletePricingRule(id: string, staffId: string): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      "DELETE FROM pricing_rules WHERE id = $1 RETURNING label, rate_minor_per_hour",
      [id],
    );
    if (rows.length === 0) throw new ConfigError("not_found", "That rate no longer exists.");

    await audit(client, {
      actorType: "staff",
      actorId: staffId,
      action: "pricing.deleted",
      entityType: "pricing_rule",
      entityId: id,
      diff: { label: rows[0].label, rateMinorPerHour: rows[0].rate_minor_per_hour },
    });
  });
}

/**
 * Which minutes of a trading night have no rate at all.
 *
 * The pricing engine refuses to quote an unpriced minute rather than charging zero, so a
 * gap here means customers simply cannot book that time. Worth showing staff plainly
 * rather than letting them discover it through a failed booking.
 */
export async function findPricingGaps(): Promise<
  Array<{ sportSlug: string; sportName: string; gaps: string[] }>
> {
  const { rows: sports } = await pool().query(
    "SELECT id, slug, name FROM sports WHERE is_active ORDER BY sort_order",
  );
  const { rows: hours } = await pool().query(
    "SELECT opens_at, closes_at, closes_next_day FROM operating_hours WHERE NOT is_closed LIMIT 1",
  );
  if (hours.length === 0) return [];

  const opens = parseLocalTime(hours[0].opens_at);
  const closes = parseLocalTime(hours[0].closes_at) + (hours[0].closes_next_day ? 1440 : 0);

  const rules = await listPricingRules();
  const report: Array<{ sportSlug: string; sportName: string; gaps: string[] }> = [];

  for (const sport of sports) {
    const applicable = rules.filter(
      (rule) => rule.isActive && (rule.sportId === null || rule.sportId === sport.id),
    );

    const uncovered: number[] = [];
    for (let minute = opens; minute < closes; minute += 30) {
      const wrapped = minute % 1440;
      const covered = applicable.some((rule) => {
        const start = parseLocalTime(rule.startsAtLocal);
        const end = parseLocalTime(rule.endsAtLocal);
        return end <= start
          ? wrapped >= start || wrapped < end
          : wrapped >= start && wrapped < end;
      });
      if (!covered) uncovered.push(minute);
    }

    if (uncovered.length > 0) {
      report.push({
        sportSlug: sport.slug,
        sportName: sport.name,
        gaps: uncovered.map((minute) => formatLocalTime12h(minute)),
      });
    }
  }

  return report;
}

// --- Opening hours ---------------------------------------------------------------------

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface OpeningHoursRow {
  dayOfWeek: number;
  dayName: string;
  opensAt: string;
  closesAt: string;
  closesNextDay: boolean;
  isClosed: boolean;
  label: string;
  openHours: number;
}

export async function listOpeningHours(): Promise<OpeningHoursRow[]> {
  const { rows } = await pool().query(
    "SELECT day_of_week, opens_at, closes_at, closes_next_day, is_closed FROM operating_hours ORDER BY day_of_week",
  );

  // Fill in any weekday with no row at all, so the form always shows seven days. A
  // missing row means closed, which is the safe reading.
  const byDay = new Map(rows.map((row) => [row.day_of_week as number, row]));

  return Array.from({ length: 7 }, (_, day) => {
    const row = byDay.get(day);
    const opensAt = row ? String(row.opens_at).slice(0, 5) : "17:00";
    const closesAt = row ? String(row.closes_at).slice(0, 5) : "03:00";
    const closesNextDay = row ? row.closes_next_day : true;
    const isClosed = row ? row.is_closed : true;

    const open = parseLocalTime(opensAt);
    const close = parseLocalTime(closesAt) + (closesNextDay ? 1440 : 0);

    return {
      dayOfWeek: day,
      dayName: DAY_NAMES[day],
      opensAt,
      closesAt,
      closesNextDay,
      isClosed,
      label: isClosed
        ? "Closed"
        : `${formatLocalTime12h(parseLocalTime(opensAt))} – ${formatLocalTime12h(parseLocalTime(closesAt))}`,
      openHours: isClosed ? 0 : Math.round(((close - open) / 60) * 10) / 10,
    };
  });
}

export interface SaveOpeningHoursInput {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
  staffId: string;
}

/**
 * Set one day's opening hours.
 *
 * `closes_next_day` is worked out rather than asked for: if the closing time is at or
 * before the opening time, the venue trades past midnight. Asking staff to tick a box
 * called "closes next day" is asking them to understand the data model.
 */
export async function saveOpeningHours(
  input: SaveOpeningHoursInput,
): Promise<{ closesNextDay: boolean }> {
  if (input.dayOfWeek < 0 || input.dayOfWeek > 6) {
    throw new ConfigError("invalid", "That is not a day of the week.");
  }

  const opens = parseLocalTime(input.opensAt);
  const closes = parseLocalTime(input.closesAt);
  const closesNextDay = closes <= opens;

  if (!input.isClosed && closes === opens) {
    throw new ConfigError(
      "invalid",
      "Opening and closing at the same time is not a 24-hour day — set one of them differently.",
    );
  }

  await withTransaction(async (client) => {
    const { rows: before } = await client.query(
      "SELECT opens_at, closes_at, is_closed FROM operating_hours WHERE day_of_week = $1",
      [input.dayOfWeek],
    );

    await client.query(
      `INSERT INTO operating_hours (day_of_week, opens_at, closes_at, closes_next_day, is_closed)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (day_of_week) DO UPDATE SET
         opens_at = EXCLUDED.opens_at,
         closes_at = EXCLUDED.closes_at,
         closes_next_day = EXCLUDED.closes_next_day,
         is_closed = EXCLUDED.is_closed`,
      [input.dayOfWeek, input.opensAt, input.closesAt, closesNextDay, input.isClosed],
    );

    await audit(client, {
      actorType: "staff",
      actorId: input.staffId,
      action: "schedule.hours_updated",
      entityType: "operating_hours",
      entityId: String(input.dayOfWeek),
      diff: {
        day: DAY_NAMES[input.dayOfWeek],
        from: before[0]
          ? `${String(before[0].opens_at).slice(0, 5)}–${String(before[0].closes_at).slice(0, 5)}${before[0].is_closed ? " (closed)" : ""}`
          : "(not set)",
        to: input.isClosed ? "closed" : `${input.opensAt}–${input.closesAt}`,
      },
    });
  });

  return { closesNextDay };
}

/**
 * Bookings that would fall outside a proposed change to a day's hours.
 *
 * Shown before saving, because shortening a day does not cancel anything — it just means
 * existing bookings now sit outside opening hours, and somebody has to deal with them.
 */
export async function bookingsOutsideProposedHours(args: {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}): Promise<Array<{ reference: string; startsAt: Date; customerName: string }>> {
  const opens = parseLocalTime(args.opensAt);
  const closes = parseLocalTime(args.closesAt) + (parseLocalTime(args.closesAt) <= opens ? 1440 : 0);

  const { rows } = await pool().query(
    `SELECT b.reference, b.starts_at, b.ends_at, b.customer_name
       FROM bookings b
      WHERE b.status IN ('confirmed', 'pending_approval')
        AND b.starts_at > now()
        -- The business day a session belongs to, using the venue's 05:00 rollover.
        AND EXTRACT(DOW FROM
              ((b.starts_at AT TIME ZONE 'Asia/Karachi')
                 - make_interval(hours => 5))::date
            )::int = $1
      ORDER BY b.starts_at`,
    [args.dayOfWeek],
  );

  if (args.isClosed) {
    return rows.map((row) => ({
      reference: row.reference,
      startsAt: new Date(row.starts_at),
      customerName: row.customer_name,
    }));
  }

  return rows
    .filter((row) => {
      const start = new Date(row.starts_at);
      const end = new Date(row.ends_at);
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Karachi",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
      const toMinutes = (date: Date) => {
        const [h, m] = local.format(date).split(":").map(Number);
        const raw = (h % 24) * 60 + m;
        // Fold the small hours onto the end of the night so they compare correctly.
        return raw < 300 ? raw + 1440 : raw;
      };
      return toMinutes(start) < opens || toMinutes(end) > closes;
    })
    .map((row) => ({
      reference: row.reference,
      startsAt: new Date(row.starts_at),
      customerName: row.customer_name,
    }));
}

// --- Menu ------------------------------------------------------------------------------

export interface MenuItemRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  basePriceMinor: number | null;
  isAvailable: boolean;
  isOrderable: boolean;
  sortOrder: number;
  variantCount: number;
  description: string | null;
  dietaryTags: string[];
  allergenNote: string | null;
  image: MenuPhoto | null;
  isFeatured: boolean;
  publicationStatus: MenuStatus;
  variants: MenuVariant[];
}

export async function listMenuItemsForAdmin(): Promise<MenuItemRow[]> {
  const { rows } = await pool().query(
    `SELECT m.*,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name,
         'priceMinor', m.base_price_minor + v.price_delta_minor) ORDER BY v.sort_order)
         FROM menu_item_variants v WHERE v.menu_item_id = m.id), '[]'::jsonb) AS variants
     FROM menu_items m ORDER BY m.category, m.sort_order, m.name`,
  );
  return rows.map((row) => ({
    id: row.id, slug: row.slug, name: row.name, category: row.category,
    basePriceMinor: row.base_price_minor, isAvailable: row.is_available,
    isOrderable: row.is_orderable, sortOrder: row.sort_order,
    variantCount: row.variants.length, variants: row.variants,
    description: row.description, dietaryTags: row.dietary_tags,
    allergenNote: row.allergen_note, image: row.image,
    isFeatured: row.is_featured, publicationStatus: row.publication_status,
  }));
}

export async function setMenuItemAvailability(args: {
  id: string; isAvailable: boolean; staffId: string;
}): Promise<{ name: string }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      "UPDATE menu_items SET is_available = $2 WHERE id = $1 RETURNING name",
      [args.id, args.isAvailable],
    );
    if (!rows.length) throw new ConfigError("not_found", "That item no longer exists.");
    await audit(client, {
      actorType: "staff", actorId: args.staffId,
      action: args.isAvailable ? "menu.back_on" : "menu.sold_out",
      entityType: "menu_item", entityId: args.id, diff: { name: rows[0].name },
    });
    return { name: rows[0].name as string };
  });
}

export interface SaveMenuItemInput {
  id?: string | null;
  name: string;
  category: string;
  basePriceMinor: number | null;
  isAvailable: boolean;
  sortOrder: number;
  staffId: string;
  description?: string | null;
  dietaryTags?: string[];
  allergenNote?: string | null;
  image?: MenuPhoto | null;
  imageAlt?: string;
  isFeatured?: boolean;
  publicationStatus?: MenuStatus;
  variants?: MenuVariant[];
}

export async function saveMenuItem(input: SaveMenuItemInput): Promise<{ id: string }> {
  const name = input.name.trim();
  const category = input.category.trim();
  if (name.length < 2 || name.length > 120) throw new ConfigError("invalid", "Give the item a name of 2–120 characters.");
  if (category.length < 2 || category.length > 60) throw new ConfigError("invalid", "Give the category a name of 2–60 characters.");
  const status = input.publicationStatus ?? "published";
  if (!["draft", "published", "archived"].includes(status)) throw new ConfigError("invalid", "Choose a valid publication status.");
  try { validateMenuPrice(input.basePriceMinor, status); }
  catch (error) { throw new ConfigError("invalid", error instanceof Error ? error.message : "Invalid price."); }
  const variants = input.variants;
  if (variants && variants.length > 20) throw new ConfigError("invalid", "Use at most 20 sizes or variants.");
  for (const variant of variants ?? []) {
    validateMenuPrice(variant.priceMinor, "published");
    if (input.basePriceMinor === null || !variant.name.trim() || variant.name.length > 60) {
      throw new ConfigError("invalid", "Each size needs a name and price, and the item needs a base price.");
    }
  }
  if (variants && new Set(variants.map(v => v.name.trim().toLowerCase())).size !== variants.length) {
    throw new ConfigError("invalid", "Use a different name for each size.");
  }
  return withTransaction(async (client) => {
    const before = input.id
      ? (await client.query("SELECT * FROM menu_items WHERE id = $1 FOR UPDATE", [input.id])).rows[0]
      : null;
    if (input.id && !before) throw new ConfigError("not_found", "That item no longer exists.");
    const savedImage = input.image === undefined ? before?.image ?? null : input.image;
    const image = savedImage ? { ...savedImage } : null;
    if (image && input.imageAlt !== undefined) image.alt = input.imageAlt.trim();
    if (image && (!image.alt || image.alt.length < 3 || image.alt.length > 160)) {
      throw new ConfigError("invalid", "Describe the photo in 3–160 characters.");
    }
    // Existing variants require a base price even when this item is saved as a draft.
    if (input.basePriceMinor === null && variants === undefined && before) {
      const existing = await client.query("SELECT 1 FROM menu_item_variants WHERE menu_item_id = $1 LIMIT 1", [before.id]);
      if (existing.rowCount) throw new ConfigError("invalid", "Remove the sizes before clearing the base price.");
    }
    const fields = [name, category, input.basePriceMinor, input.isAvailable, input.sortOrder,
      input.description === undefined ? before?.description ?? null : input.description?.trim() || null,
      JSON.stringify(input.dietaryTags ?? before?.dietary_tags ?? []),
      input.allergenNote === undefined ? before?.allergen_note ?? null : input.allergenNote?.trim() || null,
      image ? JSON.stringify(image) : null, input.isFeatured ?? before?.is_featured ?? false, status];
    let id = input.id;
    if (id) {
      await client.query(`UPDATE menu_items SET name=$1, category=$2, base_price_minor=$3,
        is_available=$4, sort_order=$5, description=$6, dietary_tags=$7::jsonb,
        allergen_note=$8, image=$9::jsonb, is_featured=$10, publication_status=$11, admin_managed=true WHERE id=$12`, [...fields,id]);
    } else {
      const base = slugify(name);
      // Serialize slug allocation; concurrent identical names get distinct stable slugs.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", [base]);
      let slug = base;
      for (let suffix = 2; ; suffix++) {
        if (!(await client.query("SELECT 1 FROM menu_items WHERE slug=$1", [slug])).rowCount) break;
        slug = `${base}-${suffix}`;
      }
      const result = await client.query(`INSERT INTO menu_items
        (name,category,base_price_minor,is_available,sort_order,description,dietary_tags,
          allergen_note,image,is_featured,publication_status,slug,admin_managed)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,$12,true) RETURNING id`, [...fields,slug]);
      id = result.rows[0].id as string;
    }
    if (variants !== undefined) {
      const kept: string[] = [];
      for (const [order,variant] of variants.entries()) {
        const delta = variant.priceMinor - input.basePriceMinor!;
        if (variant.id) {
          const result = await client.query(`UPDATE menu_item_variants SET name=$1, price_delta_minor=$2,
            sort_order=$3 WHERE id=$4 AND menu_item_id=$5 RETURNING id`,
            [variant.name.trim(),delta,order,variant.id,id]);
          if (!result.rowCount) throw new ConfigError("invalid", "That size does not belong to this item.");
          kept.push(variant.id);
        } else {
          const result = await client.query(`INSERT INTO menu_item_variants (menu_item_id,name,price_delta_minor,sort_order)
            VALUES ($1,$2,$3,$4) RETURNING id`, [id,variant.name.trim(),delta,order]);
          kept.push(result.rows[0].id);
        }
      }
      await client.query("DELETE FROM menu_item_variants WHERE menu_item_id=$1 AND NOT (id=ANY($2::uuid[]))",[id,kept]);
    }
    await audit(client, {
      actorType: "staff", actorId: input.staffId, action: before ? "menu.updated" : "menu.created",
      entityType: "menu_item", entityId: id!,
      diff: { before, after: { ...input, image } },
    });
    return { id: id! };
  });
}

/** Archive rather than deleting a product linked to historical receipts. */
export async function deleteMenuItem(id: string, staffId: string): Promise<void> {
  await withTransaction(async (client) => {
    const result = await client.query("UPDATE menu_items SET publication_status='archived' WHERE id=$1 RETURNING name",[id]);
    if (!result.rowCount) throw new ConfigError("not_found", "That item no longer exists.");
    await audit(client,{actorType:"staff",actorId:staffId,action:"menu.archived",entityType:"menu_item",entityId:id,diff:{name:result.rows[0].name}});
  });
}

export async function listMenuCategories(): Promise<string[]> {
  const { rows } = await pool().query(
    "SELECT DISTINCT category FROM menu_items ORDER BY category",
  );
  return rows.map((row) => row.category as string);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "item"
  );
}

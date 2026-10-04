import { pool } from "@/lib/db/client";
import { formatPkr } from "@/lib/domain/money";
import { formatLocalTime12h, parseLocalTime } from "@/lib/domain/time";
import { SAMPLE_SPORTS } from "@/lib/content/sample";
import { getSportEditorial } from "@/lib/content";
import type { MenuItemContent, SportSummary } from "@/lib/content/types";

/**
 * Read-side queries for the public pages.
 *
 * These read the operational database, not the CMS, for anything the booking engine also
 * depends on -- which sports exist, when the venue is open, what a court costs, whether a
 * dish is available. If the marketing page and the booking engine disagree about any of
 * those, the marketing page is lying, so they share one source.
 *
 * Editorial copy (the blurb, the photography) comes from the CMS and is merged on top.
 */

/** Feature flags, server-authoritative. Anything unset is treated as off. */
export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  const { rows } = await pool().query<{ key: string; value: unknown }>(
    "SELECT key, value FROM settings WHERE value IN ('true'::jsonb, 'false'::jsonb)",
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value === true]));
}

export async function isSampleContent(): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags["content.isSample"] !== false;
}

/**
 * Sports the public may see, with a "from" price derived from the cheapest configured
 * rate. Returns no price label at all when nothing is configured, rather than "from Rs 0".
 */
export async function getPublicSports(): Promise<SportSummary[]> {
  const { rows } = await pool().query<{
    slug: string;
    name: string;
    resource_slug: string;
    resource_kind: string;
    min_rate: number | null;
    sibling_count: number;
  }>(
    `SELECT s.slug, s.name, r.slug AS resource_slug, r.kind::text AS resource_kind,
            (SELECT min(p.rate_minor_per_hour) FROM pricing_rules p
              WHERE p.is_active AND (p.sport_id = s.id OR p.sport_id IS NULL)) AS min_rate,
            -- How many other ACTIVE sports share this court. Drives the shared-court note.
            (SELECT count(*) FROM sports s2
              WHERE s2.resource_id = s.resource_id AND s2.id <> s.id AND s2.is_active) AS sibling_count
       FROM sports s JOIN resources r ON r.id = s.resource_id
      WHERE s.is_active AND r.is_active
      ORDER BY s.sort_order, s.name`,
  );

  const pricingIsSample = (await getFeatureFlags())["pricing.isSample"] === true;

  // Words and pictures from the CMS, matched by slug. The database still decides which
  // sports exist and what they cost.
  const editorial = await getSportEditorial();

  // Which other ACTIVE sports share each court, so the note can name them.
  const siblingNames = new Map<string, string[]>();
  for (const row of rows) {
    siblingNames.set(
      row.slug,
      rows.filter((other) => other.resource_slug === row.resource_slug && other.slug !== row.slug)
        .map((other) => other.name),
    );
  }

  return rows.map((row) => {
    const sample = SAMPLE_SPORTS[row.slug];
    const siblings = siblingNames.get(row.slug) ?? [];

    const cms = editorial.get(row.slug);

    return {
      slug: row.slug,
      name: row.name,
      blurb: cms?.blurb ?? sample?.blurb ?? "",
      // Derived entirely from live data, never from the sample copy. Deactivating a
      // sport therefore removes it from every other sport's court note automatically --
      // the site cannot advertise a sport the venue has switched off.
      courtNote:
        siblings.length > 0
          ? `Played on the multipurpose court, shared with ${formatList(siblings)} — booking one takes that time off the board for the other${siblings.length > 1 ? "s" : ""}.`
          : "Its own dedicated court, yours for the whole session.",
      image: cms?.image ?? sample?.image ?? null,
      fromPriceLabel:
        row.min_rate === null
          ? null
          : `From ${formatPkr(row.min_rate)}/hr${pricingIsSample ? "*" : ""}`,
    };
  });
}

/** "5pm – 3am", built from the configured hours. null when nothing is configured. */
export async function getHoursLabel(): Promise<string | null> {
  const { rows } = await pool().query<{
    opens_at: string;
    closes_at: string;
    variants: number;
  }>(
    `SELECT opens_at, closes_at, (SELECT count(DISTINCT (opens_at, closes_at, is_closed)) FROM operating_hours) AS variants
       FROM operating_hours WHERE NOT is_closed ORDER BY day_of_week LIMIT 1`,
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const label = `${formatLocalTime12h(parseLocalTime(row.opens_at))} – ${formatLocalTime12h(parseLocalTime(row.closes_at))}`;
  // If days differ, do not imply one blanket range; point at the Visit section instead.
  return Number(row.variants) > 1 ? `${label} (varies by day)` : label;
}

/** Full opening hours, one row per weekday, for the Visit section and /contact. */
export async function getOpeningHoursTable(): Promise<
  Array<{ day: string; label: string; isClosed: boolean }>
> {
  const { rows } = await pool().query<{
    day_of_week: number;
    opens_at: string;
    closes_at: string;
    closes_next_day: boolean;
    is_closed: boolean;
  }>("SELECT day_of_week, opens_at, closes_at, closes_next_day, is_closed FROM operating_hours ORDER BY day_of_week");

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return rows.map((row) => ({
    day: dayNames[row.day_of_week],
    label: row.is_closed
      ? "Closed"
      : `${formatLocalTime12h(parseLocalTime(row.opens_at))} – ${formatLocalTime12h(parseLocalTime(row.closes_at))}`,
    isClosed: row.is_closed,
  }));
}

/**
 * Menu items. Prices and availability come from the database because those are the
 * numbers the café actually charges and the stock it actually has.
 */
export async function getMenuItems(options: { featuredOnly?: boolean; limit?: number } = {}): Promise<
  MenuItemContent[]
> {
  const { rows } = await pool().query<{
    slug: string; name: string; category: string; base_price_minor: number;
    is_available: boolean; description: string | null; dietary_tags: string[];
    allergen_note: string | null; image: MenuItemContent["image"]; is_featured: boolean;
    variant_count: number; minimum_price: number; variants: Array<{ name: string; priceMinor: number }>;
  }>(
    `SELECT m.*,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('name', v.name, 'priceMinor', m.base_price_minor + v.price_delta_minor) ORDER BY v.sort_order)
         FROM menu_item_variants v WHERE v.menu_item_id=m.id AND v.is_available), '[]'::jsonb) AS variants,
       (SELECT count(*) FROM menu_item_variants v WHERE v.menu_item_id=m.id AND v.is_available) AS variant_count,
       COALESCE((SELECT min(m.base_price_minor + v.price_delta_minor)
         FROM menu_item_variants v WHERE v.menu_item_id=m.id AND v.is_available), m.base_price_minor) AS minimum_price
     FROM menu_items m
     WHERE m.publication_status='published' AND m.base_price_minor IS NOT NULL
       AND (NOT $1::boolean OR m.is_featured)
     ORDER BY m.sort_order, m.name LIMIT $2`,
    [options.featuredOnly ?? false, options.limit ?? null],
  );
  return rows.map(row => ({
    slug: row.slug, name: row.name, description: row.description, category: row.category,
    priceLabel: `${Number(row.variant_count) > 0 ? "From " : ""}${formatPkr(row.minimum_price)}`,
    variants: row.variants.map(v => ({ name: v.name, priceLabel: formatPkr(v.priceMinor) })),
    dietaryTags: row.dietary_tags, allergenNote: row.allergen_note,
    image: row.image, isFeatured: row.is_featured, isAvailable: row.is_available,
  }));
}

/** "Football and cricket", "a, b and c". */
function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Distinct menu categories, in the order the café wants them shown. */
export async function getMenuCategories(): Promise<string[]> {
  const { rows } = await pool().query<{ category: string }>(
    "SELECT category, min(sort_order) AS ord FROM menu_items WHERE publication_status='published' GROUP BY category ORDER BY ord",
  );
  return rows.map((row) => row.category);
}

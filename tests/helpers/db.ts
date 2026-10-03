import { pool } from "@/lib/db/client";

/**
 * Integration-test helpers.
 *
 * These run against a real Postgres because what is being tested -- the exclusion
 * constraint, advisory locks, transaction isolation under genuine concurrency -- exists
 * only in the database. Mocking it would test the mock.
 */

/**
 * Wipe transactional data between tests, leaving configuration (resources, sports,
 * hours, pricing) in place. TRUNCATE ... CASCADE is used so FK order does not matter.
 */
export async function resetTransactionalData(): Promise<void> {
  await pool().query(`
    TRUNCATE
      reservations, bookings, booking_addons, payment_intents, payment_webhook_events,
      refunds, notifications, audit_log, maintenance_blocks, blackout_periods,
      cafe_table_allocations, cafe_reservations, cafe_orders, cafe_order_items,
      event_registrations, coupon_redemptions, inquiries, rate_limit_buckets, sessions
    RESTART IDENTITY CASCADE
  `);
}

export async function sportIdBySlug(slug: string): Promise<string> {
  const { rows } = await pool().query("SELECT id FROM sports WHERE slug = $1", [slug]);
  if (rows.length === 0) throw new Error(`No sport "${slug}". Run: npm run db:seed`);
  return rows[0].id;
}

export async function setSportActive(slug: string, active: boolean): Promise<void> {
  await pool().query("UPDATE sports SET is_active = $2 WHERE slug = $1", [slug, active]);
}

export async function countBookings(where = "TRUE"): Promise<number> {
  const { rows } = await pool().query(`SELECT count(*)::int AS n FROM bookings WHERE ${where}`);
  return rows[0].n;
}

export async function countBlockingReservations(): Promise<number> {
  const { rows } = await pool().query(
    "SELECT count(*)::int AS n FROM reservations WHERE blocks_availability",
  );
  return rows[0].n;
}

/** Make a booking's hold look as though it expired, without waiting for it to. */
export async function expireHold(bookingId: string): Promise<void> {
  await pool().query(
    "UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1",
    [bookingId],
  );
  await pool().query(
    "UPDATE reservations SET expires_at = now() - interval '1 minute' WHERE booking_id = $1",
    [bookingId],
  );
}

export async function closePool(): Promise<void> {
  await pool().end();
}

/**
 * Snapshot and restore the venue configuration.
 *
 * Tests that change rates, opening hours or the menu are changing data every OTHER test
 * file reads — a deactivated pricing rule makes unrelated booking tests fail with "no
 * hourly rate configured", which is a confusing way to find out your test leaked.
 *
 * Hand-restoring the columns a test happened to touch is how that leak happened once
 * already. This copies the whole rows and puts them back exactly.
 */

interface ConfigSnapshot {
  pricingRules: Record<string, unknown>[];
  operatingHours: Record<string, unknown>[];
  menuItems: Record<string, unknown>[];
}

export async function snapshotVenueConfig(): Promise<ConfigSnapshot> {
  const [pricingRules, operatingHours, menuItems] = await Promise.all([
    pool().query("SELECT * FROM pricing_rules"),
    pool().query("SELECT * FROM operating_hours"),
    pool().query("SELECT * FROM menu_items"),
  ]);
  return {
    pricingRules: pricingRules.rows,
    operatingHours: operatingHours.rows,
    menuItems: menuItems.rows,
  };
}

export async function restoreVenueConfig(snapshot: ConfigSnapshot): Promise<void> {
  // Delete-then-reinsert rather than update: a test may have created rows too, and those
  // have to go as well or the next file sees a menu item that should not exist.
  await pool().query("DELETE FROM pricing_rules");
  for (const row of snapshot.pricingRules) {
    await pool().query(
      `INSERT INTO pricing_rules (id, label, sport_id, resource_id, days_of_week,
                                  starts_at_local, ends_at_local, rate_minor_per_hour,
                                  is_peak, priority, valid_from, valid_to, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        row.id, row.label, row.sport_id, row.resource_id, row.days_of_week,
        row.starts_at_local, row.ends_at_local, row.rate_minor_per_hour,
        row.is_peak, row.priority, row.valid_from, row.valid_to, row.is_active, row.created_at,
      ],
    );
  }

  await pool().query("DELETE FROM operating_hours");
  for (const row of snapshot.operatingHours) {
    await pool().query(
      `INSERT INTO operating_hours (id, day_of_week, opens_at, closes_at, closes_next_day, is_closed)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [row.id, row.day_of_week, row.opens_at, row.closes_at, row.closes_next_day, row.is_closed],
    );
  }

  // Menu items are referenced by café order lines, so they are updated in place and only
  // rows the test added are removed.
  const keptIds = snapshot.menuItems.map((row) => row.id as string);
  await pool().query(
    keptIds.length > 0
      ? "DELETE FROM menu_items WHERE id <> ALL($1::uuid[])"
      : "DELETE FROM menu_items",
    keptIds.length > 0 ? [keptIds] : [],
  );
  for (const row of snapshot.menuItems) {
    await pool().query(
      `UPDATE menu_items
          SET slug = $2, name = $3, category = $4, base_price_minor = $5,
              is_available = $6, is_orderable = $7, sort_order = $8
        WHERE id = $1`,
      [
        row.id, row.slug, row.name, row.category, row.base_price_minor,
        row.is_available, row.is_orderable, row.sort_order,
      ],
    );
  }
}

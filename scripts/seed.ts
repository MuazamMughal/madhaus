/**
 * Development seed.
 *
 * Establishes the venue's real operational shape -- two physical courts, three sports,
 * 17:00-03:00 opening -- and then adds the minimum SAMPLE data needed for the booking
 * and café flows to actually run.
 *
 * On sample data:
 *   - Court rates and menu prices ARE seeded, because without a rate the pricing engine
 *     correctly refuses to quote and the whole booking flow is untestable. Every seeded
 *     rate is labelled "SAMPLE", and `content.isSample` is set so the site shows the
 *     placeholder banner and stays out of search results.
 *   - Nothing that would be a real-world claim is invented: no address, no phone number,
 *     no dietary or allergen information, no reviews.
 *   - Futsal uses the existing football slug and shares the cricket court.
 *
 * Safe to re-run: every insert is keyed on a natural unique column and upserts.
 */
import { Client } from "pg";
import { pgSslOptions } from "@/lib/db/ssl";
import { scryptSync, randomBytes } from "node:crypto";
import "./load-env";

const PADEL_COURT = "padel-court-1";
const SHARED_COURT = "multipurpose-court-1";

/** Same scheme as lib/auth: scrypt, per-user salt, no native dependency. */
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/** Whole rupees to paisa. */
const rupees = (major: number): number => Math.round(major * 100);

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ...pgSslOptions(connectionString),
  });
  await client.connect();

  try {
    await client.query("BEGIN");

    // --- Settings / feature flags ---------------------------------------------------
    // Everything half-built is off. Nothing incomplete can appear publicly.
    const settings: Array<[string, unknown, string]> = [
      ["content.isSample", true, "Site is showing shipped sample content. Set false once the real CMS dataset is live."],
      ["pricing.isSample", true, "Court rates are placeholders. Prices display an 'indicative' note while true."],
      ["booking.requestHoldHours", 48, "Backstop: how long an undecided request keeps its slot before it is released automatically. Requests are normally released by staff approving or declining them."],
      ["booking.holdMinutes", 15, "Unused in the request-and-approve flow. Kept for a future instant-booking mode."],
      ["booking.leadTimeMinutes", 60, "Minimum notice for an online request."],
      ["booking.bookingHorizonDays", 30, "How far ahead the calendar is open."],
      ["booking.cancellationCutoffHours", 12, "Customers may cancel online up to this many hours before the start."],
      ["booking.rescheduleCutoffHours", 12, "Customers may reschedule online up to this many hours before the start."],
      ["booking.requiresApproval", true, "Every online booking is a request that staff approve by hand, against the walk-ins and phone bookings this system never sees."],
      ["cafe.tableReservations", true, "Café table reservation requests are accepted."],
      ["cafe.tableInstantConfirm", false, "OFF: instant confirmation needs real table capacity. Requests are staff-approved."],
      ["cafe.pickupOrders", false, "OFF until the kitchen confirms it will run a pickup queue."],
      ["cafe.courtAddons", true, "Café items can be attached to a court booking."],
      ["cafe.delivery", false, "OFF. Delivery is advertised on Instagram but no delivery operation is implemented here."],
      ["events.registration", false, "OFF until a real event with real capacity exists."],
      ["gallery.socialEmbeds", false, "OFF. No runtime dependency on scraping social networks."],
      ["reviews.enabled", false, "OFF. No approved, attributable reviews have been supplied."],
    ];
    for (const [key, value, description] of settings) {
      await client.query(
        `INSERT INTO settings (key, value, description) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description`,
        [key, JSON.stringify(value), description],
      );
    }

    // --- Physical resources ---------------------------------------------------------
    // Two resources, because there are two things that can only be used by one party at
    // a time. This is the fact the whole booking model rests on.
    const resourceRows: Array<[string, string, string, number, number]> = [
      // slug, name, kind, turnaround, sport-change buffer
      [PADEL_COURT, "Padel Court", "padel", 0, 0],
      // The shared court needs time to go from stumps to goals, so a sport change
      // carries a 20-minute buffer that the booking engine enforces.
      [SHARED_COURT, "Multipurpose Court", "multipurpose", 0, 20],
    ];
    const resourceIds = new Map<string, string>();
    for (const [slug, name, kind, turnaround, buffer] of resourceRows) {
      const { rows } = await client.query(
        `INSERT INTO resources (slug, name, kind, turnaround_minutes, sport_change_buffer_minutes, sort_order)
         VALUES ($1,$2,$3::resource_kind,$4,$5,$6)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name, kind = EXCLUDED.kind,
           turnaround_minutes = EXCLUDED.turnaround_minutes,
           sport_change_buffer_minutes = EXCLUDED.sport_change_buffer_minutes
         RETURNING id`,
        [slug, name, kind, turnaround, buffer, resourceIds.size],
      );
      resourceIds.set(slug, rows[0].id);
    }

    // --- Sports ---------------------------------------------------------------------
    // Football and cricket both point at SHARED_COURT. That single shared resource_id is
    // what makes them mutually exclusive -- no application logic required.
    const sportRows: Array<{
      slug: string;
      name: string;
      resource: string;
      durations: number[];
      defaultDuration: number;
      step: number;
      minPlayers: number | null;
      maxPlayers: number | null;
      active: boolean;
    }> = [
      {
        slug: "padel",
        name: "Padel",
        resource: PADEL_COURT,
        durations: [60, 90, 120],
        defaultDuration: 60,
        step: 30,
        minPlayers: 2,
        maxPlayers: 4,
        active: true,
      },
      {
        slug: "cricket",
        name: "Cricket",
        resource: SHARED_COURT,
        durations: [60, 90, 120],
        defaultDuration: 90,
        step: 30,
        minPlayers: null,
        maxPlayers: null,
        active: true,
      },
      {
        slug: "football",
        name: "Futsal",
        resource: SHARED_COURT,
        durations: [60, 90, 120],
        defaultDuration: 60,
        step: 30,
        minPlayers: null,
        maxPlayers: null,
        // Keep the existing identifier so reservations and prices retain their links.
        active: true,
      },
    ];
    const sportIds = new Map<string, string>();
    for (const [index, sport] of sportRows.entries()) {
      const { rows } = await client.query(
        `INSERT INTO sports (slug, name, resource_id, allowed_durations, default_duration,
                             slot_step_minutes, min_players, max_players, is_active, sort_order)
         VALUES ($1,$2,$3,$4::integer[],$5,$6,$7,$8,$9,$10)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name, resource_id = EXCLUDED.resource_id,
           allowed_durations = EXCLUDED.allowed_durations,
           default_duration = EXCLUDED.default_duration,
           slot_step_minutes = EXCLUDED.slot_step_minutes,
           min_players = EXCLUDED.min_players, max_players = EXCLUDED.max_players,
           is_active = EXCLUDED.is_active
         RETURNING id`,
        [
          sport.slug,
          sport.name,
          resourceIds.get(sport.resource),
          `{${sport.durations.join(",")}}`,
          sport.defaultDuration,
          sport.step,
          sport.minPlayers,
          sport.maxPlayers,
          sport.active,
          index,
        ],
      );
      sportIds.set(sport.slug, rows[0].id);
    }

    // --- Opening hours --------------------------------------------------------------
    // VERIFIED from the venue's Instagram bio: "Timings: 5pm to 3am". Applied to every
    // day, because the bio gives a single range and does not vary by weekday.
    // closes_next_day is true: this is the case the whole time model was built around.
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      await client.query(
        `INSERT INTO operating_hours (day_of_week, opens_at, closes_at, closes_next_day, is_closed)
         VALUES ($1, '17:00', '03:00', true, false)
         ON CONFLICT (day_of_week) DO UPDATE SET
           opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at,
           closes_next_day = EXCLUDED.closes_next_day, is_closed = EXCLUDED.is_closed`,
        [dayOfWeek],
      );
    }

    // --- Pricing --------------------------------------------------------------------
    // SAMPLE RATES. The venue has published no prices anywhere. These exist so the
    // booking flow can be exercised end to end, and every label says so. `pricing.isSample`
    // makes the UI mark them as indicative.
    //
    // Structured to prove the engine handles what the venue actually needs: an off-peak
    // early-evening band, a peak prime-time band, and a cheaper late-night band that
    // wraps past midnight.
    await client.query("DELETE FROM pricing_rules WHERE label LIKE 'SAMPLE%'");
    const priceRows: Array<{
      label: string;
      sport: string | null;
      days: number[];
      from: string;
      to: string;
      rate: number;
      peak: boolean;
      priority: number;
    }> = [
      // Base band covering the whole trading night, so no minute is ever unpriced.
      { label: "SAMPLE — Padel, standard", sport: "padel", days: [], from: "17:00", to: "03:00", rate: rupees(3000), peak: false, priority: 0 },
      { label: "SAMPLE — Padel, prime time", sport: "padel", days: [], from: "20:00", to: "23:00", rate: rupees(4000), peak: true, priority: 10 },
      { label: "SAMPLE — Padel, late night", sport: "padel", days: [], from: "23:00", to: "03:00", rate: rupees(2500), peak: false, priority: 10 },
      // Weekend nights cost more, and the rule is keyed to Friday and Saturday evenings.
      { label: "SAMPLE — Padel, weekend prime", sport: "padel", days: [5, 6], from: "20:00", to: "23:00", rate: rupees(4500), peak: true, priority: 20 },

      { label: "SAMPLE — Cricket, standard", sport: "cricket", days: [], from: "17:00", to: "03:00", rate: rupees(3500), peak: false, priority: 0 },
      { label: "SAMPLE — Cricket, prime time", sport: "cricket", days: [], from: "20:00", to: "23:00", rate: rupees(4500), peak: true, priority: 10 },
      { label: "SAMPLE — Cricket, late night", sport: "cricket", days: [], from: "23:00", to: "03:00", rate: rupees(3000), peak: false, priority: 10 },

      { label: "SAMPLE — Football, standard", sport: "football", days: [], from: "17:00", to: "03:00", rate: rupees(3500), peak: false, priority: 0 },
      { label: "SAMPLE — Football, prime time", sport: "football", days: [], from: "20:00", to: "23:00", rate: rupees(4500), peak: true, priority: 10 },
      { label: "SAMPLE — Football, late night", sport: "football", days: [], from: "23:00", to: "03:00", rate: rupees(3000), peak: false, priority: 10 },
    ];
    for (const rule of priceRows) {
      await client.query(
        `INSERT INTO pricing_rules (label, sport_id, days_of_week, starts_at_local, ends_at_local,
                                    rate_minor_per_hour, is_peak, priority)
         VALUES ($1,$2,$3::integer[],$4,$5,$6,$7,$8)`,
        [
          rule.label,
          rule.sport ? sportIds.get(rule.sport) : null,
          `{${rule.days.join(",")}}`,
          rule.from,
          rule.to,
          rule.rate,
          rule.peak,
          rule.priority,
        ],
      );
    }

    // --- Equipment add-ons ----------------------------------------------------------
    // SAMPLE. Whether the venue hires equipment out at all is unconfirmed.
    await client.query("DELETE FROM addons WHERE slug LIKE 'sample-%'");
    await client.query(
      `INSERT INTO addons (slug, name, description, kind, price_minor, sport_ids, max_per_booking, sort_order)
       VALUES
        ('sample-padel-racket', 'SAMPLE — Padel racket hire', 'Placeholder. Confirm whether the venue hires rackets, and at what price.', 'equipment', $1, $2::uuid[], 4, 0),
        ('sample-ball-set', 'SAMPLE — Ball set', 'Placeholder. Confirm availability and price.', 'equipment', $3, '{}'::uuid[], 3, 1)`,
      [rupees(500), `{${sportIds.get("padel")}}`, rupees(300)],
    );

    // --- Café menu ------------------------------------------------------------------
    // SAMPLE items and SAMPLE prices, so the menu UI and the café order maths can be
    // exercised. No dietary tags and no allergen notes: getting either wrong is a real
    // harm, so they stay empty until the kitchen supplies them.
    await client.query("DELETE FROM menu_items WHERE slug LIKE 'sample-%'");
    const menuRows: Array<[string, string, string, number, boolean]> = [
      ["sample-house-burger", "SAMPLE — House Burger", "Mains", rupees(950), true],
      ["sample-club-sandwich", "SAMPLE — Club Sandwich", "Mains", rupees(750), true],
      ["sample-loaded-fries", "SAMPLE — Loaded Fries", "Sides", rupees(450), true],
      ["sample-wings", "SAMPLE — Wings", "Starters", rupees(650), false],
      ["sample-cold-coffee", "SAMPLE — Cold Coffee", "Coffee", rupees(450), true],
      ["sample-espresso", "SAMPLE — Espresso", "Coffee", rupees(300), true],
    ];
    for (const [index, [slug, name, category, price, available]] of menuRows.entries()) {
      const { rows } = await client.query(
        `INSERT INTO menu_items (slug, name, category, base_price_minor, is_available, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [slug, name, category, price, available, index],
      );
      // A couple of variants, to prove variant pricing works.
      if (category === "Coffee") {
        await client.query(
          `INSERT INTO menu_item_variants (menu_item_id, name, price_delta_minor, sort_order)
           VALUES ($1,'Regular',0,0), ($1,'Large',$2,1)`,
          [rows[0].id, rupees(120)],
        );
      }
    }

    // --- Café tables ----------------------------------------------------------------
    // SAMPLE. Real capacity is unknown, which is exactly why instant confirmation is off.
    await client.query("DELETE FROM cafe_tables WHERE label LIKE 'SAMPLE%'");
    for (let n = 1; n <= 6; n += 1) {
      await client.query(
        "INSERT INTO cafe_tables (label, seats) VALUES ($1, $2) ON CONFLICT (label) DO NOTHING",
        [`SAMPLE Table ${n}`, n <= 4 ? 4 : 6],
      );
    }

    // --- First staff account --------------------------------------------------------
    const ownerEmail = process.env.SEED_OWNER_EMAIL;
    const ownerPassword = process.env.SEED_OWNER_PASSWORD;
    if (ownerEmail && ownerPassword) {
      await client.query(
        `INSERT INTO staff_users (email, name, password_hash, role)
         VALUES ($1, 'Venue Owner', $2, 'owner')
         ON CONFLICT (lower(email)) DO NOTHING`,
        [ownerEmail, hashPassword(ownerPassword)],
      );
      console.log(`  owner account: ${ownerEmail}`);
    } else {
      console.log("  no owner account created (set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD)");
    }

    await client.query("COMMIT");

    console.log("\nSeeded:");
    console.log("  2 physical resources (padel court, shared multipurpose court)");
    console.log("  3 sports — padel, cricket and futsal active; cricket and futsal share a court");
    console.log("  opening hours 17:00–03:00 every day (verified from the venue's Instagram bio)");
    console.log(`  ${priceRows.length} SAMPLE pricing rules, ${menuRows.length} SAMPLE menu items`);
    console.log("\nBooking flow: every online booking is a REQUEST that staff approve.");
    console.log("Payment: pay at the venue by default; JazzCash by hand when configured.");
    console.log("\nFeature flags OFF until confirmed: pickup ordering, delivery,");
    console.log("café instant confirmation, event registration, reviews, social embeds.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("\nSeed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

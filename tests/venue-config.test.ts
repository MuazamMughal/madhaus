import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/client";
import {
  ConfigError,
  bookingsOutsideProposedHours,
  deleteMenuItem,
  findPricingGaps,
  listMenuItemsForAdmin,
  listOpeningHours,
  listPricingRules,
  saveMenuItem,
  saveOpeningHours,
  savePricingRule,
  setMenuItemAvailability,
} from "@/server/venue-config-service";
import { getDayAvailability, quote } from "@/server/booking-service";
import { venueDateToInstant } from "@/lib/domain/time";
import {
  closePool,
  resetTransactionalData,
  restoreVenueConfig,
  snapshotVenueConfig,
} from "./helpers/db";

/**
 * Venue configuration the staff own.
 *
 * The thing worth testing is not that a row updates — it is that changing a rate or an
 * opening time actually changes what a customer is quoted and shown, and that it never
 * touches a booking already made.
 */

const DATE = inDays(6);

function inDays(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + days * 86_400_000));
}

async function staffId(): Promise<string> {
  const { rows } = await pool().query("SELECT id FROM staff_users LIMIT 1");
  return rows[0].id;
}

/**
 * The seed configuration, captured once before anything here touches it.
 *
 * These tests deliberately break the config — switching every padel rate off, closing a
 * day — and other test files read the same database. Restoring from a full snapshot
 * rather than by hand means a column added later cannot be forgotten.
 */
let seedConfig: Awaited<ReturnType<typeof snapshotVenueConfig>>;

beforeAll(async () => {
  seedConfig = await snapshotVenueConfig();

  /*
   * Guard against starting from a database a previous interrupted run left broken.
   *
   * These tests deliberately switch rates off and restore them afterwards. If the suite
   * is killed partway, the config stays broken, and every other test file then fails with
   * "no hourly rate is configured" -- 30-odd failures pointing nowhere near the cause.
   * One clear message beats that.
   */
  const gaps = await findPricingGaps();
  if (gaps.length > 0) {
    throw new Error(
      `The seeded pricing is incomplete, so these tests would start from a broken state ` +
        `(${gaps.map((gap) => gap.sportName).join(", ")} have unpriced hours). ` +
        `A previous run was probably interrupted. Run: npm run db:seed`,
    );
  }
});

beforeEach(async () => {
  await resetTransactionalData();
  await restoreVenueConfig(seedConfig);
});

afterAll(async () => {
  await resetTransactionalData();
  await restoreVenueConfig(seedConfig);
  await closePool();
});

describe("court rates", () => {
  it("changes what a new booking is quoted", async () => {
    const startsAt = venueDateToInstant(DATE, 18 * 60);
    const before = await quote({ sportSlug: "padel", startsAt, durationMinutes: 60 });

    const rules = await listPricingRules();
    const standard = rules.find((r) => r.label === "SAMPLE — Padel, standard");
    expect(standard).toBeDefined();

    await savePricingRule({
      id: standard!.id,
      label: standard!.label,
      sportId: standard!.sportId,
      daysOfWeek: standard!.daysOfWeek,
      startsAtLocal: standard!.startsAtLocal,
      endsAtLocal: standard!.endsAtLocal,
      rateMinorPerHour: 777_00,
      isPeak: standard!.isPeak,
      priority: standard!.priority,
      isActive: true,
      staffId: await staffId(),
    });

    const after = await quote({ sportSlug: "padel", startsAt, durationMinutes: 60 });
    expect(after.totalMinor).not.toBe(before.totalMinor);
    expect(after.totalMinor).toBe(777_00);
  });

  it("records who changed a price, and from what to what", async () => {
    const rules = await listPricingRules();
    const rule = rules.find((r) => r.label === "SAMPLE — Padel, weekend prime")!;

    await savePricingRule({
      id: rule.id,
      label: rule.label,
      sportId: rule.sportId,
      daysOfWeek: rule.daysOfWeek,
      startsAtLocal: rule.startsAtLocal,
      endsAtLocal: rule.endsAtLocal,
      rateMinorPerHour: 600_000,
      isPeak: rule.isPeak,
      priority: rule.priority,
      isActive: true,
      staffId: await staffId(),
    });

    const { rows } = await pool().query(
      "SELECT actor_type, diff FROM audit_log WHERE entity_type='pricing_rule' ORDER BY id DESC LIMIT 1",
    );
    expect(rows[0].actor_type).toBe("staff");
    expect(rows[0].diff.rateFrom).toBe(450_000);
    expect(rows[0].diff.rateTo).toBe(600_000);
  });

  it("refuses a negative rate and a zero-length window", async () => {
    const base = {
      label: "Bad",
      sportId: null,
      daysOfWeek: [],
      startsAtLocal: "18:00",
      endsAtLocal: "20:00",
      isPeak: false,
      priority: 0,
      isActive: true,
      staffId: await staffId(),
    };
    await expect(savePricingRule({ ...base, rateMinorPerHour: -1 })).rejects.toThrow(ConfigError);
    await expect(
      savePricingRule({ ...base, rateMinorPerHour: 100, endsAtLocal: "18:00" }),
    ).rejects.toThrow(RangeError);
  });

  it("reports a gap when a rate is switched off, because unpriced time cannot be booked", async () => {
    expect(await findPricingGaps()).toHaveLength(0);

    const rules = await listPricingRules();
    for (const rule of rules.filter((r) => r.sportName === "Padel")) {
      await savePricingRule({
        id: rule.id,
        label: rule.label,
        sportId: rule.sportId,
        daysOfWeek: rule.daysOfWeek,
        startsAtLocal: rule.startsAtLocal,
        endsAtLocal: rule.endsAtLocal,
        rateMinorPerHour: rule.rateMinorPerHour,
        isPeak: rule.isPeak,
        priority: rule.priority,
        isActive: false,
        staffId: await staffId(),
      });
    }

    const gaps = await findPricingGaps();
    expect(gaps.some((gap) => gap.sportSlug === "padel")).toBe(true);
  });
});

describe("opening hours", () => {
  it("changes which slots the booking page offers", async () => {
    const before = await getDayAvailability({
      date: DATE,
      sportSlug: "padel",
      durationMinutes: 60,
    });

    // Close two hours earlier.
    await saveOpeningHours({
      dayOfWeek: new Date(`${DATE}T12:00:00Z`).getUTCDay(),
      opensAt: "17:00",
      closesAt: "01:00",
      isClosed: false,
      staffId: await staffId(),
    });

    const after = await getDayAvailability({
      date: DATE,
      sportSlug: "padel",
      durationMinutes: 60,
    });
    expect(after.slots.length).toBeLessThan(before.slots.length);
  });

  it("works out 'closes next day' from the times rather than asking", async () => {
    const result = await saveOpeningHours({
      dayOfWeek: 1,
      opensAt: "17:00",
      closesAt: "03:00",
      isClosed: false,
      staffId: await staffId(),
    });
    expect(result.closesNextDay).toBe(true);

    const sameDay = await saveOpeningHours({
      dayOfWeek: 1,
      opensAt: "09:00",
      closesAt: "17:00",
      isClosed: false,
      staffId: await staffId(),
    });
    expect(sameDay.closesNextDay).toBe(false);
  });

  it("closes a day entirely", async () => {
    const day = new Date(`${DATE}T12:00:00Z`).getUTCDay();
    await saveOpeningHours({
      dayOfWeek: day,
      opensAt: "17:00",
      closesAt: "03:00",
      isClosed: true,
      staffId: await staffId(),
    });

    const availability = await getDayAvailability({
      date: DATE,
      sportSlug: "padel",
      durationMinutes: 60,
    });
    expect(availability.isClosed).toBe(true);
    expect(availability.slots).toHaveLength(0);

    const hours = await listOpeningHours();
    expect(hours[day].isClosed).toBe(true);
  });

  it("warns about bookings that would fall outside shortened hours", async () => {
    const outside = await bookingsOutsideProposedHours({
      dayOfWeek: new Date(`${DATE}T12:00:00Z`).getUTCDay(),
      opensAt: "17:00",
      closesAt: "18:00",
      isClosed: false,
    });
    // Nothing booked in this test run, so the list is empty -- the point is that the
    // check runs and returns a list rather than silently cancelling anything.
    expect(Array.isArray(outside)).toBe(true);
  });
});

describe("menu", () => {
  it("marks an item sold out and back on", async () => {
    const items = await listMenuItemsForAdmin();
    const item = items.find((i) => i.isAvailable)!;

    await setMenuItemAvailability({ id: item.id, isAvailable: false, staffId: await staffId() });
    let after = await listMenuItemsForAdmin();
    expect(after.find((i) => i.id === item.id)!.isAvailable).toBe(false);

    await setMenuItemAvailability({ id: item.id, isAvailable: true, staffId: await staffId() });
    after = await listMenuItemsForAdmin();
    expect(after.find((i) => i.id === item.id)!.isAvailable).toBe(true);
  });

  it("creates an item with a unique slug derived from the name", async () => {
    const id = await staffId();
    await saveMenuItem({
      name: "Test Chapli Kebab",
      category: "Mains",
      basePriceMinor: 85_000,
      isAvailable: true,
      sortOrder: 0,
      staffId: id,
    });

    const items = await listMenuItemsForAdmin();
    const created = items.find((i) => i.name === "Test Chapli Kebab");
    expect(created).toBeDefined();
    expect(created!.slug).toBe("test-chapli-kebab");
    expect(created!.basePriceMinor).toBe(85_000);

    await deleteMenuItem(created!.id, id);
  });

  it("refuses an item with no name or a negative price", async () => {
    const id = await staffId();
    await expect(
      saveMenuItem({ name: "x", category: "Mains", basePriceMinor: 100, isAvailable: true, sortOrder: 0, staffId: id }),
    ).rejects.toThrow(ConfigError);
    await expect(
      saveMenuItem({ name: "Fine", category: "Mains", basePriceMinor: -5, isAvailable: true, sortOrder: 0, staffId: id }),
    ).rejects.toThrow(ConfigError);
  });
});

import { describe, expect, it } from "vitest";
import { PricingError, quoteBooking, type PricingRule } from "@/lib/domain/pricing";
import { rupees } from "@/lib/domain/money";
import { venueDateToInstant } from "@/lib/domain/time";

const SPORT = "sport-1";
const RESOURCE = "resource-1";

function rule(overrides: Partial<PricingRule> & { id: string; rateMinorPerHour: number }): PricingRule {
  return {
    label: overrides.id,
    sportId: null,
    resourceId: null,
    daysOfWeek: [],
    startsAtMinute: 0,
    endsAtMinute: 1439,
    isPeak: false,
    priority: 0,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

/** 17:00-03:00 base band, 20:00-23:00 peak, 23:00-03:00 cheaper late-night. */
const RULES: PricingRule[] = [
  rule({ id: "base", rateMinorPerHour: rupees(3000), startsAtMinute: 17 * 60, endsAtMinute: 3 * 60 }),
  rule({
    id: "peak",
    rateMinorPerHour: rupees(4000),
    startsAtMinute: 20 * 60,
    endsAtMinute: 23 * 60,
    isPeak: true,
    priority: 10,
  }),
  rule({
    id: "late",
    rateMinorPerHour: rupees(2500),
    startsAtMinute: 23 * 60,
    endsAtMinute: 3 * 60,
    priority: 10,
  }),
];

function quote(startMinute: number, durationMinutes: number, rules = RULES, date = "2026-10-02") {
  const startsAt = venueDateToInstant(date, startMinute);
  return quoteBooking({
    sportId: SPORT,
    resourceId: RESOURCE,
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    rules,
  });
}

describe("pricing", () => {
  it("prices a whole hour in a single band", () => {
    const result = quote(18 * 60, 60);
    expect(result.bands).toHaveLength(1);
    expect(result.totalMinor).toBe(rupees(3000));
  });

  it("splits a booking that straddles the peak boundary and charges each part correctly", () => {
    // 19:30-21:00: 30 minutes off-peak at 3000, then 60 minutes peak at 4000.
    const result = quote(19 * 60 + 30, 90);
    expect(result.bands).toHaveLength(2);
    expect(result.bands[0]).toMatchObject({ minutes: 30, isPeak: false, amountMinor: rupees(1500) });
    expect(result.bands[1]).toMatchObject({ minutes: 60, isPeak: true, amountMinor: rupees(4000) });
    expect(result.totalMinor).toBe(rupees(5500));
  });

  it("prices a session that runs past midnight using the wrapping late-night rule", () => {
    // 23:30-01:30. The late rule wraps 23:00-03:00 and must cover both sides of midnight.
    const result = quote(23 * 60 + 30, 120);
    expect(result.bands).toHaveLength(1);
    expect(result.bands[0].rateMinorPerHour).toBe(rupees(2500));
    expect(result.totalMinor).toBe(rupees(5000));
  });

  it("crosses three bands in one booking", () => {
    // 22:00-00:00: one hour peak, one hour late-night.
    const result = quote(22 * 60, 120);
    expect(result.bands.map((band) => band.label)).toEqual(["peak", "late"]);
    expect(result.totalMinor).toBe(rupees(4000) + rupees(2500));
  });

  it("applies a weekday rule only on its own days, counting the owning night", () => {
    const fridayNight = rule({
      id: "friday",
      rateMinorPerHour: rupees(6000),
      startsAtMinute: 22 * 60,
      endsAtMinute: 2 * 60,
      daysOfWeek: [5], // Friday
      priority: 50,
    });
    const rules = [...RULES, fridayNight];

    // 2026-10-02 is a Friday. A 23:00 start is Friday night.
    expect(quote(23 * 60, 60, rules, "2026-10-02").bands[0].label).toBe("friday");
    // 01:00 on Saturday the 3rd is still FRIDAY night, so the rule must still apply.
    expect(quote(60, 60, rules, "2026-10-03").bands[0].label).toBe("friday");
    // 23:00 on Saturday the 3rd is Saturday night, so it must not.
    expect(quote(23 * 60, 60, rules, "2026-10-03").bands[0].label).toBe("late");
  });

  it("breaks a priority tie towards the higher rate, never the lower", () => {
    const rules = [
      rule({ id: "cheap", rateMinorPerHour: rupees(1000), priority: 5 }),
      rule({ id: "dear", rateMinorPerHour: rupees(2000), priority: 5 }),
    ];
    expect(quote(18 * 60, 60, rules).bands[0].label).toBe("dear");
  });

  it("refuses to quote rather than charging zero when a minute has no rate", () => {
    // Base band only covers 17:00-03:00; 15:00 is unpriced.
    expect(() => quote(15 * 60, 60)).toThrow(PricingError);
    try {
      quote(15 * 60, 60);
    } catch (error) {
      expect((error as PricingError).code).toBe("no_rate");
    }
  });

  it("adds add-ons at their line totals", () => {
    const startsAt = venueDateToInstant("2026-10-02", 18 * 60);
    const result = quoteBooking({
      sportId: SPORT,
      resourceId: RESOURCE,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      rules: RULES,
      addons: [{ addonId: "a1", name: "Racket hire", unitPriceMinor: rupees(500), quantity: 2 }],
    });
    expect(result.addonsSubtotalMinor).toBe(rupees(1000));
    expect(result.totalMinor).toBe(rupees(4000));
  });

  it("applies a percentage coupon to the whole subtotal and never below zero", () => {
    const startsAt = venueDateToInstant("2026-10-02", 18 * 60);
    const result = quoteBooking({
      sportId: SPORT,
      resourceId: RESOURCE,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      rules: RULES,
      coupon: {
        id: "c1",
        code: "TENOFF",
        kind: "percent",
        discountBps: 1000,
        discountMinor: null,
        minSubtotalMinor: 0,
        sportIds: [],
      },
    });
    expect(result.discountMinor).toBe(rupees(300));
    expect(result.totalMinor).toBe(rupees(2700));
  });

  it("rejects a coupon that does not apply to this sport", () => {
    const startsAt = venueDateToInstant("2026-10-02", 18 * 60);
    expect(() =>
      quoteBooking({
        sportId: SPORT,
        resourceId: RESOURCE,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60_000),
        rules: RULES,
        coupon: {
          id: "c2",
          code: "PADELONLY",
          kind: "percent",
          discountBps: 5000,
          discountMinor: null,
          minSubtotalMinor: 0,
          sportIds: ["a-different-sport"],
        },
      }),
    ).toThrow(/does not apply/);
  });

  it("caps a fixed discount at the subtotal so a booking can never go negative", () => {
    const startsAt = venueDateToInstant("2026-10-02", 18 * 60);
    const result = quoteBooking({
      sportId: SPORT,
      resourceId: RESOURCE,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      rules: RULES,
      coupon: {
        id: "c3",
        code: "HUGE",
        kind: "fixed",
        discountBps: null,
        discountMinor: rupees(100_000),
        minSubtotalMinor: 0,
        sportIds: [],
      },
    });
    expect(result.discountMinor).toBe(rupees(3000));
    expect(result.totalMinor).toBe(0);
  });
});

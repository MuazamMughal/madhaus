import { applyBasisPoints, CURRENCY, prorateHourlyRate, sumMinor } from "./money";
import {
  addVenueDays,
  MINUTES_PER_DAY,
  formatLocalTime,
  minutesBetween,
  toVenueWallClock,
  venueDayOfWeek,
  formatVenueDate,
  type VenueDate,
} from "./time";

/**
 * Pricing.
 *
 * This module is the ONLY place a court price is decided, and it runs on the server.
 * The browser is told what a booking costs; it is never asked. Anything a client sends
 * about money is discarded, and the result is frozen onto the booking as a snapshot so
 * a later price change cannot rewrite what a customer agreed to pay.
 *
 * A booking can straddle rate bands -- 22:00-23:30 on a Friday may be peak until 23:00
 * and off-peak after -- so the engine resolves the rate per minute and then coalesces
 * runs of identical minutes into bands for the receipt.
 */

export interface PricingRule {
  id: string;
  label: string;
  /** null = applies to every sport. */
  sportId: string | null;
  /** null = applies to every resource. */
  resourceId: string | null;
  /**
   * Postgres DOW values (0 = Sunday). Empty = every day.
   *
   * For a rule that wraps past midnight, this is the day the window OPENS on: a
   * "Friday night" rate written as 22:00-03:00 covers Saturday 01:00, because that is
   * still Friday night to everyone who works here.
   */
  daysOfWeek: readonly number[];
  startsAtMinute: number;
  endsAtMinute: number;
  rateMinorPerHour: number;
  isPeak: boolean;
  priority: number;
  validFrom: VenueDate | null;
  validTo: VenueDate | null;
}

export interface AddonSelection {
  addonId: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
}

export interface CouponDefinition {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  discountBps: number | null;
  discountMinor: number | null;
  minSubtotalMinor: number;
  /** Empty = valid for every sport. */
  sportIds: readonly string[];
}

export interface RateBand {
  label: string;
  ruleId: string | null;
  startsAtLocal: string;
  endsAtLocal: string;
  minutes: number;
  rateMinorPerHour: number;
  isPeak: boolean;
  amountMinor: number;
}

export interface PriceBreakdown {
  currency: typeof CURRENCY;
  bands: RateBand[];
  courtSubtotalMinor: number;
  addons: Array<AddonSelection & { lineTotalMinor: number }>;
  addonsSubtotalMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  discountLabel: string | null;
  couponCode: string | null;
  totalMinor: number;
}

export class PricingError extends Error {
  readonly code: "no_rate" | "coupon_invalid";
  constructor(code: PricingError["code"], message: string) {
    super(message);
    this.name = "PricingError";
    this.code = code;
  }
}

export interface QuoteInput {
  sportId: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  rules: readonly PricingRule[];
  addons?: readonly AddonSelection[];
  coupon?: CouponDefinition | null;
}

/**
 * Price a court booking.
 *
 * Throws `no_rate` rather than guessing when a minute of the booking has no rate
 * configured. Silently charging zero for an unpriced hour is worse than refusing the
 * booking and telling staff their pricing table has a hole in it.
 */
export function quoteBooking(input: QuoteInput): PriceBreakdown {
  const totalMinutes = minutesBetween(input.startsAt, input.endsAt);
  if (totalMinutes <= 0) {
    throw new RangeError("A booking must end after it starts.");
  }

  const bands = resolveRateBands(input, totalMinutes);
  const courtSubtotalMinor = sumMinor(bands.map((band) => band.amountMinor));

  const addons = (input.addons ?? []).map((addon) => ({
    ...addon,
    lineTotalMinor: addon.unitPriceMinor * addon.quantity,
  }));
  const addonsSubtotalMinor = sumMinor(addons.map((addon) => addon.lineTotalMinor));

  const subtotalMinor = courtSubtotalMinor + addonsSubtotalMinor;

  let discountMinor = 0;
  let discountLabel: string | null = null;
  let couponCode: string | null = null;

  if (input.coupon) {
    const discount = evaluateCoupon(input.coupon, {
      subtotalMinor,
      sportId: input.sportId,
    });
    discountMinor = discount.amountMinor;
    discountLabel = discount.label;
    couponCode = input.coupon.code;
  }

  return {
    currency: CURRENCY,
    bands,
    courtSubtotalMinor,
    addons,
    addonsSubtotalMinor,
    subtotalMinor,
    discountMinor,
    discountLabel,
    couponCode,
    totalMinor: Math.max(subtotalMinor - discountMinor, 0),
  };
}

/**
 * Walk the booking minute by minute, resolve the winning rule for each, then coalesce
 * consecutive minutes that share a rule. 240 iterations at the very most, so the
 * simple approach is also the fast one.
 */
function resolveRateBands(input: QuoteInput, totalMinutes: number): RateBand[] {
  const applicable = input.rules.filter(
    (rule) =>
      (rule.sportId === null || rule.sportId === input.sportId) &&
      (rule.resourceId === null || rule.resourceId === input.resourceId),
  );

  const perMinute: Array<PricingRule | null> = [];
  for (let offset = 0; offset < totalMinutes; offset += 1) {
    const instant = new Date(input.startsAt.getTime() + offset * 60_000);
    perMinute.push(pickRuleForInstant(applicable, instant));
  }

  const missingAt = perMinute.findIndex((rule) => rule === null);
  if (missingAt !== -1) {
    const instant = new Date(input.startsAt.getTime() + missingAt * 60_000);
    const wall = toVenueWallClock(instant);
    throw new PricingError(
      "no_rate",
      `No hourly rate is configured for ${formatLocalTime(wall.hour * 60 + wall.minute)} on ${formatVenueDate(instant)}. Add a pricing rule that covers it.`,
    );
  }

  const bands: RateBand[] = [];
  let runStart = 0;
  for (let offset = 1; offset <= totalMinutes; offset += 1) {
    const sameAsPrevious =
      offset < totalMinutes && perMinute[offset]?.id === perMinute[runStart]?.id;
    if (sameAsPrevious) continue;

    const rule = perMinute[runStart] as PricingRule;
    const minutes = offset - runStart;
    const bandStart = new Date(input.startsAt.getTime() + runStart * 60_000);
    const bandEnd = new Date(input.startsAt.getTime() + offset * 60_000);
    const startWall = toVenueWallClock(bandStart);
    const endWall = toVenueWallClock(bandEnd);

    bands.push({
      label: rule.label,
      ruleId: rule.id,
      startsAtLocal: formatLocalTime(startWall.hour * 60 + startWall.minute),
      endsAtLocal: formatLocalTime(endWall.hour * 60 + endWall.minute),
      minutes,
      rateMinorPerHour: rule.rateMinorPerHour,
      isPeak: rule.isPeak,
      amountMinor: prorateHourlyRate(rule.rateMinorPerHour, minutes),
    });
    runStart = offset;
  }

  return bands;
}

/** Highest priority wins; ties break towards the more expensive rate, never the cheaper. */
function pickRuleForInstant(
  rules: readonly PricingRule[],
  instant: Date,
): PricingRule | null {
  let best: PricingRule | null = null;
  for (const rule of rules) {
    if (!ruleCoversInstant(rule, instant)) continue;
    if (
      best === null ||
      rule.priority > best.priority ||
      (rule.priority === best.priority && rule.rateMinorPerHour > best.rateMinorPerHour)
    ) {
      best = rule;
    }
  }
  return best;
}

function ruleCoversInstant(rule: PricingRule, instant: Date): boolean {
  const wall = toVenueWallClock(instant);
  const minuteOfDay = wall.hour * 60 + wall.minute;
  const calendarDate = formatVenueDate(instant);

  const wraps = rule.endsAtMinute <= rule.startsAtMinute;
  const inWindow = wraps
    ? minuteOfDay >= rule.startsAtMinute || minuteOfDay < rule.endsAtMinute
    : minuteOfDay >= rule.startsAtMinute && minuteOfDay < rule.endsAtMinute;
  if (!inWindow) return false;

  // For the post-midnight tail of a wrapping rule, the owning day -- and therefore the
  // date the validity window is checked against -- is yesterday.
  const inTail = wraps && minuteOfDay < rule.endsAtMinute;
  const owningDate = inTail ? addVenueDays(calendarDate, -1) : calendarDate;

  if (rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(venueDayOfWeek(owningDate))) {
    return false;
  }
  if (rule.validFrom !== null && owningDate < rule.validFrom) return false;
  if (rule.validTo !== null && owningDate > rule.validTo) return false;

  return true;
}

/**
 * Work out a coupon's cash value.
 *
 * Eligibility is re-checked here even though the CMS may already advertise the offer:
 * published marketing is a claim, and the server is what decides.
 */
export function evaluateCoupon(
  coupon: CouponDefinition,
  context: { subtotalMinor: number; sportId: string },
): { amountMinor: number; label: string } {
  if (coupon.sportIds.length > 0 && !coupon.sportIds.includes(context.sportId)) {
    throw new PricingError("coupon_invalid", `${coupon.code} does not apply to this sport.`);
  }
  if (context.subtotalMinor < coupon.minSubtotalMinor) {
    throw new PricingError(
      "coupon_invalid",
      `${coupon.code} needs a larger booking to apply.`,
    );
  }

  if (coupon.kind === "percent") {
    if (coupon.discountBps === null) {
      throw new PricingError("coupon_invalid", `${coupon.code} is misconfigured.`);
    }
    return {
      amountMinor: Math.min(
        applyBasisPoints(context.subtotalMinor, coupon.discountBps),
        context.subtotalMinor,
      ),
      label: `${coupon.code} — ${(coupon.discountBps / 100).toFixed(0)}% off`,
    };
  }

  if (coupon.discountMinor === null) {
    throw new PricingError("coupon_invalid", `${coupon.code} is misconfigured.`);
  }
  return {
    amountMinor: Math.min(coupon.discountMinor, context.subtotalMinor),
    label: `${coupon.code} applied`,
  };
}

/**
 * Has the price moved since the customer was quoted?
 *
 * Called immediately before a booking is confirmed. A price that changed mid-checkout
 * has to be shown and re-accepted rather than quietly charged.
 */
export function quoteMatchesSnapshot(
  fresh: PriceBreakdown,
  snapshot: Pick<PriceBreakdown, "subtotalMinor" | "discountMinor" | "totalMinor">,
): boolean {
  return (
    fresh.subtotalMinor === snapshot.subtotalMinor &&
    fresh.discountMinor === snapshot.discountMinor &&
    fresh.totalMinor === snapshot.totalMinor
  );
}

/** Guard against a nonsensical rule reaching the database from the staff pricing form. */
export function assertRuleWindowSane(startsAtMinute: number, endsAtMinute: number): void {
  const inRange = (value: number) => Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;
  if (!inRange(startsAtMinute) || !inRange(endsAtMinute)) {
    throw new RangeError("Rate window times must be whole minutes within a single day.");
  }
  if (startsAtMinute === endsAtMinute) {
    throw new RangeError("A rate window cannot start and end at the same minute.");
  }
}

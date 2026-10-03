/**
 * Money is always integer minor units (paisa; 100 paisa = PKR 1).
 *
 * Floats are never used for money anywhere in this codebase. Rates are stored per hour
 * and pro-rated by the minute, so the rounding rule below is the only place a fraction
 * of a paisa can appear.
 */

export const CURRENCY = "PKR" as const;

/** Minor units per major unit. */
const MINOR_PER_MAJOR = 100;

/**
 * Pro-rate an hourly rate over a number of minutes.
 *
 * Rounds half-up to the nearest whole minor unit. A 90-minute booking at
 * PKR 2,500/hour is 375000 paisa exactly; awkward durations round up by at most 1 paisa,
 * which always favours neither party materially but keeps totals reproducible.
 */
export function prorateHourlyRate(rateMinorPerHour: number, minutes: number): number {
  assertInteger(rateMinorPerHour, "rateMinorPerHour");
  assertInteger(minutes, "minutes");
  if (rateMinorPerHour < 0) throw new RangeError("rateMinorPerHour must not be negative");
  if (minutes < 0) throw new RangeError("minutes must not be negative");
  return Math.round((rateMinorPerHour * minutes) / 60);
}

/** Apply a basis-points discount (10000 bps = 100%), rounding the discount down. */
export function applyBasisPoints(amountMinor: number, bps: number): number {
  assertInteger(amountMinor, "amountMinor");
  assertInteger(bps, "bps");
  if (bps < 0 || bps > 10_000) throw new RangeError("bps must be between 0 and 10000");
  return Math.floor((amountMinor * bps) / 10_000);
}

export function sumMinor(values: readonly number[]): number {
  return values.reduce((total, value) => {
    assertInteger(value, "value");
    return total + value;
  }, 0);
}

/**
 * Format for display. PKR is quoted in whole rupees in practice, so a whole-rupee
 * amount renders without decimals and anything else keeps two.
 */
export function formatPkr(
  amountMinor: number,
  options: { withSymbol?: boolean } = {},
): string {
  assertInteger(amountMinor, "amountMinor");
  const { withSymbol = true } = options;
  const major = amountMinor / MINOR_PER_MAJOR;
  const isWhole = amountMinor % MINOR_PER_MAJOR === 0;
  const body = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
  return withSymbol ? `Rs ${body}` : body;
}

/** Turn whole rupees into minor units. Used by seeds and the staff pricing form. */
export function rupees(major: number): number {
  if (!Number.isFinite(major)) throw new RangeError("major must be finite");
  return Math.round(major * MINOR_PER_MAJOR);
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer number of minor units, got ${value}`);
  }
}

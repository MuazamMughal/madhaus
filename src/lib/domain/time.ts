/**
 * Venue time.
 *
 * Two rules hold everywhere in this codebase:
 *   1. Every instant in the database is UTC (`timestamptz`).
 *   2. Every schedule the staff configure, and every time a customer sees, is
 *      Asia/Karachi wall-clock.
 *
 * The third fact that shapes all of this: MadHaus opens at 17:00 and closes at 03:00.
 * A 01:30 session on Thursday morning belongs to Wednesday's trading night. "Today" in
 * the dashboard therefore means a *business day*, not a calendar day, and the two
 * differ for a third of the opening hours.
 *
 * Offsets are resolved through `Intl`, never hardcoded. Pakistan does not currently
 * observe DST, but it has done before and may again, and a hardcoded +05:00 would
 * silently misfile every booking if it did.
 */

export const VENUE_TIME_ZONE = "Asia/Karachi";

/** A calendar date in the venue's zone, as "YYYY-MM-DD". */
export type VenueDate = string;

/** Minutes since midnight, venue-local. May exceed 1440 for post-midnight times. */
export type MinutesFromMidnight = number;

export interface VenueWallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const MS_PER_MINUTE = 60_000;
export const MINUTES_PER_DAY = 1440;

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: VENUE_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Break an instant into venue-local wall-clock fields. */
export function toVenueWallClock(instant: Date): VenueWallClock {
  const parts = PARTS_FORMATTER.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new Error(`Intl did not return a ${type} part`);
    return Number.parseInt(part.value, 10);
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // Some engines render midnight as hour 24 under hour12: false.
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** The venue-local offset east of UTC, in milliseconds, at a given instant. */
function venueOffsetMs(instant: Date): number {
  const wall = toVenueWallClock(instant);
  const asIfUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  // Discard sub-second precision on both sides so the subtraction is exact.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Convert a venue-local wall clock to the UTC instant it names.
 *
 * Two passes: the first guesses using the offset at the naive timestamp, the second
 * re-reads the offset at that candidate. That converges for every real zone rule,
 * including a DST transition, because an offset change is never larger than the
 * error of the first guess.
 */
export function venueWallClockToInstant(wall: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0,
    wall.second ?? 0,
  );
  let candidate = new Date(naive - venueOffsetMs(new Date(naive)));
  candidate = new Date(naive - venueOffsetMs(candidate));
  return candidate;
}

/** Parse "YYYY-MM-DD", rejecting anything that is not a real date. */
export function parseVenueDate(date: VenueDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Expected a YYYY-MM-DD date, got "${date}"`);
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  // Round-trip through UTC to reject 2026-02-30 and friends.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`"${date}" is not a real calendar date`);
  }
  return { year, month, day };
}

export function formatVenueDate(instant: Date): VenueDate {
  const wall = toVenueWallClock(instant);
  return `${pad(wall.year, 4)}-${pad(wall.month, 2)}-${pad(wall.day, 2)}`;
}

/** Venue-local midnight at the start of the given date, as a UTC instant. */
export function venueDateToInstant(date: VenueDate, minutesFromMidnight = 0): Date {
  const { year, month, day } = parseVenueDate(date);
  const midnight = venueWallClockToInstant({ year, month, day });
  // Adding minutes to the instant (rather than to the wall clock) keeps a session that
  // crosses a hypothetical DST boundary the length the customer actually booked.
  return new Date(midnight.getTime() + minutesFromMidnight * MS_PER_MINUTE);
}

/** Add whole days to a venue date, staying on the calendar. */
export function addVenueDays(date: VenueDate, days: number): VenueDate {
  const { year, month, day } = parseVenueDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}-${pad(shifted.getUTCDate(), 2)}`;
}

/** Postgres-compatible day of week: 0 = Sunday .. 6 = Saturday, in venue time. */
export function venueDayOfWeek(date: VenueDate): number {
  const { year, month, day } = parseVenueDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * The venue-local minute at which one trading night becomes the next.
 *
 * 05:00. The venue closes at 03:00, so nothing is ever open across this boundary and no
 * session is ever split by it. Exported because queries that count a night's takings need
 * the same boundary the rota and the till use.
 */
export const VENUE_DAY_ROLLOVER_MINUTE: MinutesFromMidnight = 300;

/**
 * The business day an instant trades on.
 *
 * Anything before `dayRollsOverAtMinute` (venue-local) counts as the previous calendar
 * day, because that is how the venue, the staff rota and the till all think about it.
 * With the default of 300 (05:00), a 02:40 padel session on the 5th is filed under
 * the 4th -- which is the night the customer booked and the shift that served them.
 */
export function venueBusinessDate(
  instant: Date,
  dayRollsOverAtMinute: MinutesFromMidnight = VENUE_DAY_ROLLOVER_MINUTE,
): VenueDate {
  const wall = toVenueWallClock(instant);
  const minutes = wall.hour * 60 + wall.minute;
  const calendarDate = `${pad(wall.year, 4)}-${pad(wall.month, 2)}-${pad(wall.day, 2)}`;
  return minutes < dayRollsOverAtMinute ? addVenueDays(calendarDate, -1) : calendarDate;
}

/** Parse "HH:MM" or "HH:MM:SS" into minutes from midnight. */
export function parseLocalTime(value: string): MinutesFromMidnight {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) throw new RangeError(`Expected HH:MM, got "${value}"`);
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour > 23 || minute > 59) throw new RangeError(`"${value}" is not a valid time of day`);
  return hour * 60 + minute;
}

/** Render minutes from midnight as "HH:MM", wrapping past 24h (1500 -> "01:00"). */
export function formatLocalTime(minutes: MinutesFromMidnight): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(wrapped / 60), 2)}:${pad(wrapped % 60, 2)}`;
}

/** Customer-facing 12-hour time: "6:30 pm", "1:00 am". */
export function formatLocalTime12h(minutes: MinutesFromMidnight): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const suffix = hour24 < 12 ? "am" : "pm";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad(minute, 2)} ${suffix}`;
}

/**
 * Turn one day's configured opening hours into an absolute UTC window.
 *
 * `closesNextDay` is the normal case at MadHaus: opens 17:00, closes 03:00, so the
 * window is 10 hours long and ends on the following calendar date.
 */
export function openingWindowForDate(
  date: VenueDate,
  hours: { opensAtMinute: MinutesFromMidnight; closesAtMinute: MinutesFromMidnight; closesNextDay: boolean },
): { start: Date; end: Date; openMinutes: number } {
  const closeMinute = hours.closesNextDay
    ? hours.closesAtMinute + MINUTES_PER_DAY
    : hours.closesAtMinute;
  if (closeMinute <= hours.opensAtMinute) {
    throw new RangeError(
      `Opening hours for ${date} close at or before they open. Set closesNextDay when the venue trades past midnight.`,
    );
  }
  return {
    start: venueDateToInstant(date, hours.opensAtMinute),
    end: venueDateToInstant(date, closeMinute),
    openMinutes: closeMinute - hours.opensAtMinute,
  };
}

/** Long customer-facing date: "Thursday 2 October". */
export function formatVenueDateLong(instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(instant);
}

/** "Thu 2 Oct, 6:30 pm" -- compact, for lists and confirmation lines. */
export function formatVenueDateTimeShort(instant: Date): string {
  const wall = toVenueWallClock(instant);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
  return `${date}, ${formatLocalTime12h(wall.hour * 60 + wall.minute)}`;
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MS_PER_MINUTE);
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_MINUTE);
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

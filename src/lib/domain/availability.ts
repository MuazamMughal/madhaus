import {
  addVenueDays,
  formatLocalTime,
  formatLocalTime12h,
  MINUTES_PER_DAY,
  openingWindowForDate,
  toVenueWallClock,
  venueDateToInstant,
  type MinutesFromMidnight,
  type VenueDate,
} from "./time";

/**
 * Availability.
 *
 * What this module produces is a *display* of what looks bookable. It is not a promise.
 * The authority on whether a slot is free is the exclusion constraint in Postgres, and
 * the booking transaction re-checks everything here under a lock before it writes. A
 * slot shown as open can still be lost to someone who was half a second quicker, and
 * the booking flow has to say so gracefully rather than pretend otherwise.
 *
 * Everything is computed against a *business day*: at MadHaus that runs 17:00 to 03:00,
 * so "Thursday" includes the small hours of Friday morning.
 */

/** An interval that occupies a court, whatever put it there. */
export interface OccupiedInterval {
  /** Inclusive start of the blocking window (play time, less nothing). */
  startsAt: Date;
  /** Exclusive end of the blocking window (play time PLUS the court's turnaround). */
  endsAt: Date;
  /**
   * `request` is a booking a customer has asked for but staff have not yet decided on. It
   * occupies the court exactly like a confirmed booking -- so two people cannot request
   * the same slot, and staff cannot approve overlapping requests -- but it is shown to
   * customers differently, because it might still free up.
   */
  kind: "booking" | "hold" | "request" | "maintenance" | "event";
  /** null for maintenance. Used by the sport-change buffer check. */
  sportId: string | null;
}

export interface OpeningHours {
  opensAtMinute: MinutesFromMidnight;
  closesAtMinute: MinutesFromMidnight;
  closesNextDay: boolean;
  isClosed: boolean;
}

export interface SportConfig {
  id: string;
  slug: string;
  name: string;
  resourceId: string;
  slotStepMinutes: number;
  allowedDurations: readonly number[];
}

export interface ResourceConfig {
  id: string;
  /** Minutes the court is unavailable after every booking, for changeover. */
  turnaroundMinutes: number;
  /** Extra minutes needed when the neighbouring booking is a different sport. */
  sportChangeBufferMinutes: number;
}

export interface BookingPolicy {
  /** How far ahead of a slot a customer must book. */
  leadTimeMinutes: number;
  /** How many days ahead the calendar is open. */
  bookingHorizonDays: number;
}

/** Why a slot cannot be taken. Drives the wording the customer sees. */
export type SlotUnavailableReason =
  | "taken"
  | "pending_approval"
  | "sport_change_buffer"
  | "maintenance"
  | "event"
  | "closed"
  | "too_soon"
  | "past";

export interface Slot {
  /** UTC instant the session starts. */
  startsAt: Date;
  /** UTC instant the session ends (play time only). */
  endsAt: Date;
  durationMinutes: number;
  /** "18:30" -- venue local, for grouping and keys. */
  startsAtLocal: string;
  /** "6:30 pm" -- venue local, for display. */
  label: string;
  available: boolean;
  reason?: SlotUnavailableReason;
}

export interface DayAvailability {
  date: VenueDate;
  sportSlug: string;
  durationMinutes: number;
  isClosed: boolean;
  /** Set when the whole day is unbookable, e.g. beyond the booking horizon. */
  closedReason?: string;
  slots: Slot[];
  /** Convenience for empty states: is there anything at all to click? */
  hasAvailableSlot: boolean;
}

export interface AvailabilityInput {
  date: VenueDate;
  sport: SportConfig;
  resource: ResourceConfig;
  hours: OpeningHours;
  durationMinutes: number;
  occupied: readonly OccupiedInterval[];
  /** Venue-wide or resource-scoped closures. */
  blackouts?: readonly { startsAt: Date; endsAt: Date }[];
  policy: BookingPolicy;
  now: Date;
}

export function computeDayAvailability(input: AvailabilityInput): DayAvailability {
  const { date, sport, resource, hours, durationMinutes, policy, now } = input;

  if (!sport.allowedDurations.includes(durationMinutes)) {
    throw new RangeError(
      `${durationMinutes} minutes is not a bookable length for ${sport.name}.`,
    );
  }

  const empty = (closedReason?: string): DayAvailability => ({
    date,
    sportSlug: sport.slug,
    durationMinutes,
    isClosed: true,
    closedReason,
    slots: [],
    hasAvailableSlot: false,
  });

  if (hours.isClosed) {
    return empty("The venue is closed on this day.");
  }

  // The horizon is counted in business days from today, so a date beyond it is simply
  // not offered rather than shown as fully booked.
  const todayBusinessDate = businessDateOf(now);
  const horizonDate = addVenueDays(todayBusinessDate, policy.bookingHorizonDays);
  if (date > horizonDate) {
    return empty(
      `Bookings open ${policy.bookingHorizonDays} days ahead. Try a date on or before ${horizonDate}.`,
    );
  }
  if (date < todayBusinessDate) {
    return empty("That date has passed.");
  }

  // Validates the configuration (throws if the day closes before it opens) before we
  // start generating slots against it.
  openingWindowForDate(date, hours);
  const earliestStart = new Date(now.getTime() + policy.leadTimeMinutes * 60_000);

  const slots: Slot[] = [];
  const closeMinute = hours.closesNextDay
    ? hours.closesAtMinute + MINUTES_PER_DAY
    : hours.closesAtMinute;

  for (
    let startMinute = hours.opensAtMinute;
    startMinute + durationMinutes <= closeMinute;
    startMinute += sport.slotStepMinutes
  ) {
    const startsAt = venueDateToInstant(date, startMinute);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    // The window this slot would actually reserve: play time plus changeover.
    const blockEnd = new Date(endsAt.getTime() + resource.turnaroundMinutes * 60_000);

    const slot: Slot = {
      startsAt,
      endsAt,
      durationMinutes,
      startsAtLocal: formatLocalTime(startMinute),
      label: formatLocalTime12h(startMinute),
      available: true,
    };

    const reason = firstBlockingReason({
      startsAt,
      blockEnd,
      sportId: sport.id,
      resource,
      occupied: input.occupied,
      blackouts: input.blackouts ?? [],
      earliestStart,
      now,
    });

    if (reason) {
      slot.available = false;
      slot.reason = reason;
    }

    slots.push(slot);
  }

  // Guard against a configuration that produces nothing, which would otherwise render
  // as a mysteriously empty day.
  if (slots.length === 0) {
    return empty(
      `A ${durationMinutes}-minute session does not fit between ${formatLocalTime(hours.opensAtMinute)} and ${formatLocalTime(hours.closesAtMinute)}.`,
    );
  }

  return {
    date,
    sportSlug: sport.slug,
    durationMinutes,
    isClosed: false,
    slots,
    hasAvailableSlot: slots.some((slot) => slot.available),
  };
}

function firstBlockingReason(args: {
  startsAt: Date;
  blockEnd: Date;
  sportId: string;
  resource: ResourceConfig;
  occupied: readonly OccupiedInterval[];
  blackouts: readonly { startsAt: Date; endsAt: Date }[];
  earliestStart: Date;
  now: Date;
}): SlotUnavailableReason | undefined {
  const { startsAt, blockEnd, sportId, resource, occupied, blackouts, earliestStart, now } = args;

  if (startsAt.getTime() <= now.getTime()) return "past";
  if (startsAt.getTime() < earliestStart.getTime()) return "too_soon";

  for (const blackout of blackouts) {
    if (overlaps(startsAt, blockEnd, blackout.startsAt, blackout.endsAt)) return "closed";
  }

  // A direct clash. Maintenance and events are named separately because "under
  // maintenance" is a better thing to tell a customer than "taken".
  for (const interval of occupied) {
    if (overlaps(startsAt, blockEnd, interval.startsAt, interval.endsAt)) {
      if (interval.kind === "maintenance") return "maintenance";
      if (interval.kind === "event") return "event";
      // Distinguished from "taken" on purpose: a requested slot is not yet anyone's, and
      // telling a customer it is "booked" would be wrong if staff decline it an hour later.
      if (interval.kind === "request") return "pending_approval";
      return "taken";
    }
  }

  // No clash, but the court may still need reconfiguring. Only relevant where a
  // resource hosts more than one sport, i.e. the multipurpose court.
  if (resource.sportChangeBufferMinutes > 0) {
    const bufferMs = resource.sportChangeBufferMinutes * 60_000;
    for (const interval of occupied) {
      if (interval.sportId === null || interval.sportId === sportId) continue;
      const gapBefore = startsAt.getTime() - interval.endsAt.getTime();
      const gapAfter = interval.startsAt.getTime() - blockEnd.getTime();
      const tooTightBefore = gapBefore >= 0 && gapBefore < bufferMs;
      const tooTightAfter = gapAfter >= 0 && gapAfter < bufferMs;
      if (tooTightBefore || tooTightAfter) return "sport_change_buffer";
    }
  }

  return undefined;
}

/** Half-open overlap: [aStart, aEnd) vs [bStart, bEnd). Touching is not overlapping. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * Wording for an unavailable slot. Short, because these sit inside a slot button's
 * accessible name rather than in a paragraph.
 */
export function explainSlotReason(
  reason: SlotUnavailableReason,
  context: { sportChangeBufferMinutes?: number } = {},
): string {
  switch (reason) {
    case "taken":
      return "Already booked";
    case "pending_approval":
      return "Requested \u2014 awaiting confirmation";
    case "sport_change_buffer":
      return context.sportChangeBufferMinutes
        ? `Court is being changed over (${context.sportChangeBufferMinutes} min)`
        : "Court is being changed over";
    case "maintenance":
      return "Court maintenance";
    case "event":
      return "Reserved for an event";
    case "closed":
      return "Venue closed";
    case "too_soon":
      return "Too close to start — call us";
    case "past":
      return "Already started";
  }
}

/**
 * Group slots into the parts of the night people actually think in. The last bucket
 * deliberately carries past midnight, because that is a normal time to be here.
 */
export function groupSlotsByPartOfNight(slots: readonly Slot[]): Array<{
  label: string;
  slots: Slot[];
}> {
  const buckets: Array<{ label: string; from: number; to: number; slots: Slot[] }> = [
    { label: "Early evening", from: 0, to: 20 * 60, slots: [] },
    { label: "Prime time", from: 20 * 60, to: 23 * 60, slots: [] },
    { label: "Late night", from: 23 * 60, to: MINUTES_PER_DAY * 2, slots: [] },
  ];

  for (const slot of slots) {
    const wall = toVenueWallClock(slot.startsAt);
    // Fold the small hours onto the end of the night rather than the start.
    const minute = wall.hour < 5 ? wall.hour * 60 + wall.minute + MINUTES_PER_DAY : wall.hour * 60 + wall.minute;
    const bucket = buckets.find((candidate) => minute >= candidate.from && minute < candidate.to);
    (bucket ?? buckets[buckets.length - 1]).slots.push(slot);
  }

  return buckets.filter((bucket) => bucket.slots.length > 0).map(({ label, slots: bucketSlots }) => ({
    label,
    slots: bucketSlots,
  }));
}

/** The business day an instant belongs to, using the same 05:00 rollover as the venue. */
function businessDateOf(instant: Date): VenueDate {
  const wall = toVenueWallClock(instant);
  const calendar = `${String(wall.year).padStart(4, "0")}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
  return wall.hour * 60 + wall.minute < 300 ? addVenueDays(calendar, -1) : calendar;
}

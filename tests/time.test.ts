import { describe, expect, it } from "vitest";
import {
  VENUE_DAY_ROLLOVER_MINUTE,
  addVenueDays,
  formatLocalTime,
  formatLocalTime12h,
  formatVenueDate,
  openingWindowForDate,
  parseLocalTime,
  toVenueWallClock,
  venueBusinessDate,
  venueDateToInstant,
  venueDayOfWeek,
  venueWallClockToInstant,
} from "@/lib/domain/time";

/**
 * These are the tests that matter most for a venue trading 17:00-03:00. Nearly every
 * date bug in a booking system is a business day confused with a calendar day.
 */
describe("venue time", () => {
  it("converts a venue wall clock to the right UTC instant (PKT is UTC+5)", () => {
    const instant = venueWallClockToInstant({ year: 2026, month: 10, day: 2, hour: 19, minute: 30 });
    expect(instant.toISOString()).toBe("2026-10-02T14:30:00.000Z");
  });

  it("round-trips an instant through the wall clock without drift", () => {
    const original = new Date("2026-10-02T14:30:00.000Z");
    const wall = toVenueWallClock(original);
    expect(wall).toMatchObject({ year: 2026, month: 10, day: 2, hour: 19, minute: 30 });
    expect(venueWallClockToInstant(wall).toISOString()).toBe(original.toISOString());
  });

  it("handles midnight as hour 0, not hour 24", () => {
    const midnight = new Date("2026-10-02T19:00:00.000Z"); // 00:00 PKT on the 3rd
    const wall = toVenueWallClock(midnight);
    expect(wall.hour).toBe(0);
    expect(wall.day).toBe(3);
  });

  it("places a post-midnight session on the business day it belongs to", () => {
    // 01:30 on 3 October, venue time. That is Friday night's trading, not Saturday's.
    const lateSession = venueDateToInstant("2026-10-03", 90);
    expect(formatVenueDate(lateSession)).toBe("2026-10-03"); // calendar date
    expect(venueBusinessDate(lateSession)).toBe("2026-10-02"); // trading night
  });

  it("rolls the business day over at 05:00, not midnight", () => {
    expect(venueBusinessDate(venueDateToInstant("2026-10-03", 4 * 60 + 59))).toBe("2026-10-02");
    expect(venueBusinessDate(venueDateToInstant("2026-10-03", 5 * 60))).toBe("2026-10-03");
  });

  it("builds a 10-hour opening window that ends on the next calendar day", () => {
    const window = openingWindowForDate("2026-10-02", {
      opensAtMinute: parseLocalTime("17:00"),
      closesAtMinute: parseLocalTime("03:00"),
      closesNextDay: true,
    });
    expect(window.openMinutes).toBe(600);
    expect(window.start.toISOString()).toBe("2026-10-02T12:00:00.000Z"); // 17:00 PKT
    // 03:00 PKT on the 3rd is 22:00 UTC on the 2nd.
    expect(window.end.toISOString()).toBe("2026-10-02T22:00:00.000Z");
  });

  it("refuses an opening window that closes before it opens without the next-day flag", () => {
    expect(() =>
      openingWindowForDate("2026-10-02", {
        opensAtMinute: parseLocalTime("17:00"),
        closesAtMinute: parseLocalTime("03:00"),
        closesNextDay: false,
      }),
    ).toThrow(/closesNextDay/);
  });

  it("adds days across a month boundary", () => {
    expect(addVenueDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addVenueDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addVenueDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
  });

  it("uses Postgres day-of-week numbering", () => {
    expect(venueDayOfWeek("2026-10-04")).toBe(0); // Sunday
    expect(venueDayOfWeek("2026-10-02")).toBe(5); // Friday
  });

  it("formats times past midnight by wrapping, so 25:00 reads as 1:00 am", () => {
    expect(formatLocalTime(25 * 60)).toBe("01:00");
    expect(formatLocalTime12h(25 * 60)).toBe("1:00 am");
    expect(formatLocalTime12h(0)).toBe("12:00 am");
    expect(formatLocalTime12h(12 * 60)).toBe("12:00 pm");
    expect(formatLocalTime12h(17 * 60)).toBe("5:00 pm");
  });

  /*
   * The reporting window on /admin/reports is built from this constant rather than left
   * to a date-to-timestamptz cast in SQL, which would resolve against the session time
   * zone. These assertions pin the boundary so a change to the rollover cannot silently
   * move what a night's takings are counted against.
   */
  it("puts the day boundary at 05:00 venue time, after the 03:00 close", () => {
    expect(VENUE_DAY_ROLLOVER_MINUTE).toBe(5 * 60);

    const boundary = venueDateToInstant("2026-10-04", VENUE_DAY_ROLLOVER_MINUTE);
    // Karachi is UTC+5 year round, so the venue's 05:00 is midnight UTC.
    expect(boundary.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("covers a whole trading night between one rollover and the next", () => {
    const start = venueDateToInstant("2026-10-04", VENUE_DAY_ROLLOVER_MINUTE);
    const end = venueDateToInstant(addVenueDays("2026-10-04", 1), VENUE_DAY_ROLLOVER_MINUTE);

    // A 17:00 opener and a 02:40 session on the following calendar day both trade on the
    // 4th and must both fall inside the window.
    const opener = venueDateToInstant("2026-10-04", 17 * 60);
    const lateSession = venueDateToInstant("2026-10-05", 2 * 60 + 40);
    for (const instant of [opener, lateSession]) {
      expect(instant.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(instant.getTime()).toBeLessThan(end.getTime());
    }

    // The next night's opener must not.
    expect(venueDateToInstant("2026-10-05", 17 * 60).getTime()).toBeGreaterThanOrEqual(
      end.getTime(),
    );

    // And each session's own business date agrees with the window it landed in.
    expect(venueBusinessDate(lateSession)).toBe("2026-10-04");
  });

  it("rejects dates that do not exist", () => {
    expect(() => venueDateToInstant("2026-02-30")).toThrow(RangeError);
    expect(() => venueDateToInstant("not-a-date")).toThrow(RangeError);
  });
});

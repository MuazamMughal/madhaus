import Link from "next/link";
import { formatPkr } from "@/lib/domain/money";
import {
  bookingStatusTone,
  humanBookingStatus,
  humanPaymentStatus,
  paymentStatusTone,
} from "@/lib/domain/booking-state";
import { formatLocalTime12h, toVenueWallClock } from "@/lib/domain/time";
import type { ScheduleEntry } from "@/server/dashboard-queries";

/**
 * Tonight's schedule, grouped by physical court.
 *
 * Grouping by court rather than by sport is the point: the shared court's football and
 * cricket bookings sit in one column, which is how the venue actually experiences them.
 */
export function DaySchedule({
  date,
  entries,
  canCreate,
}: {
  date: string;
  entries: ScheduleEntry[];
  canCreate: boolean;
}) {
  const courts = new Map<string, { name: string; entries: ScheduleEntry[] }>();
  for (const entry of entries) {
    const existing = courts.get(entry.resourceSlug);
    if (existing) existing.entries.push(entry);
    else courts.set(entry.resourceSlug, { name: entry.resourceName, entries: [entry] });
  }

  return (
    <section aria-label="Schedule">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-title">Schedule</h2>
        {canCreate && (
          <Link
            href={`/admin/bookings/new?date=${date}`}
            className="font-display flex min-h-11 items-center bg-lime px-5 text-xs text-charcoal uppercase"
          >
            + Walk-in booking
          </Link>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="hatch border border-dashed border-charcoal-line p-10 text-center">
          <p className="font-display text-title">Nothing booked</p>
          <p className="mt-2 text-sm text-grey-400">
            No bookings on either court for this night yet.
          </p>
          {canCreate && (
            <Link
              href={`/admin/bookings/new?date=${date}`}
              className="font-display mt-6 inline-flex min-h-11 items-center border-2 border-ivory px-5 text-xs uppercase hover:bg-ivory hover:text-charcoal"
            >
              Take a walk-in
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {[...courts.entries()].map(([slug, court]) => (
            <div key={slug} className="border border-charcoal-line">
              <h3 className="font-display border-b border-charcoal-line px-4 py-3 text-sm uppercase">
                {court.name}
                <span className="ml-2 text-grey-400">({court.entries.length})</span>
              </h3>

              <ul className="divide-y divide-charcoal-line">
                {court.entries.map((entry) => {
                  const startWall = toVenueWallClock(entry.startsAt);
                  const endWall = toVenueWallClock(entry.endsAt);
                  const tone = bookingStatusTone(entry.status);
                  const payTone = paymentStatusTone(entry.paymentStatus);

                  return (
                    <li key={entry.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-lg" data-numeric="">
                            {formatLocalTime12h(startWall.hour * 60 + startWall.minute)} –{" "}
                            {formatLocalTime12h(endWall.hour * 60 + endWall.minute)}
                          </p>
                          <p className="mt-1 text-sm">
                            {entry.customerName}{" "}
                            <span className="text-grey-400">· {entry.sportName}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-grey-400" data-numeric="">
                            {entry.customerPhone} ·{" "}
                            <Link
                              href={`/admin/bookings?q=${entry.reference}`}
                              className="underline underline-offset-2"
                            >
                              {entry.reference}
                            </Link>
                            {entry.source !== "online" && (
                              <span className="ml-2 uppercase">
                                {entry.source === "staff_walkin" ? "walk-in" : "phone"}
                              </span>
                            )}
                          </p>
                          {entry.notes && (
                            <p className="mt-2 border-l-2 border-charcoal-line pl-2 text-xs text-grey-300">
                              {entry.notes}
                            </p>
                          )}
                          {entry.approvalNote && (
                            <p className="mt-1.5 border-l-2 border-lime pl-2 text-xs text-grey-300">
                              <span className="text-lime">Call:</span> {entry.approvalNote}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 space-y-1 text-right">
                          {/* Status is text + border colour, never colour alone. */}
                          <p className={`font-display border px-2 py-0.5 text-[10px] uppercase ${toneBorder(tone)}`}>
                            {humanBookingStatus(entry.status)}
                          </p>
                          <p className={`text-[10px] ${toneText(payTone)}`}>
                            {humanPaymentStatus(entry.paymentStatus)}
                          </p>
                          <p className="text-sm" data-numeric="">
                            {formatPkr(entry.totalMinor)}
                          </p>
                          {entry.checkedInAt && (
                            <p className="text-[10px] text-positive">
                              <span aria-hidden="true">✓ </span>Checked in
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function toneBorder(tone: "positive" | "pending" | "negative" | "neutral"): string {
  return {
    positive: "border-positive text-positive",
    pending: "border-pending text-pending",
    negative: "border-negative text-negative",
    neutral: "border-grey-400 text-grey-300",
  }[tone];
}

function toneText(tone: "positive" | "pending" | "negative" | "neutral"): string {
  return {
    positive: "text-positive",
    pending: "text-pending",
    negative: "text-negative",
    neutral: "text-grey-400",
  }[tone];
}

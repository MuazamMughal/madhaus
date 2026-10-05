import type { Metadata } from "next";
import Link from "next/link";
import { DaySchedule } from "@/components/admin/day-schedule";
import { requirePermission, sessionHasPermission } from "@/lib/auth/permissions";
import { pool } from "@/lib/db/client";
import { listTableRequests } from "@/server/cafe-service";
import { TableRequestRow } from "@/components/admin/table-request-row";
import { formatPkr } from "@/lib/domain/money";
import { addVenueDays, formatVenueDateLong, venueBusinessDate } from "@/lib/domain/time";
import {
  getDashboardCounts,
  getDayClosures,
  getDaySchedule,
  getPendingRequests,
} from "@/server/dashboard-queries";
import { RequestQueue } from "@/components/admin/request-queue";

export const metadata: Metadata = {
  title: "Tonight",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /admin — tonight.
 *
 * The default view is the trading night that is actually running. Because the venue
 * closes at 3am, "tonight" at 1am still means the night that started yesterday evening,
 * which is what `venueBusinessDate` works out.
 */
export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const session = await requirePermission("booking.view");

  const params = await searchParams;
  const requested = Array.isArray(params.date) ? params.date[0] : params.date;
  const date =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : venueBusinessDate(new Date());

  const canViewTables = sessionHasPermission(session, "cafe.reservation.view");
  const canDecideTables = sessionHasPermission(session, "cafe.reservation.decide");
  const [schedule, closures, counts, pendingRequests, tableRequests, tables] = await Promise.all([
    getDaySchedule(date),
    getDayClosures(date),
    getDashboardCounts(date),
    getPendingRequests(),
    canViewTables ? listTableRequests({ status: "requested" }) : Promise.resolve([]),
    canDecideTables
      ? pool().query<{ id: string; label: string; seats: number }>(
          "SELECT id, label, seats FROM cafe_tables WHERE is_active ORDER BY label",
        ).then((result) => result.rows)
      : Promise.resolve([]),
  ]);

  const isTonight = date === venueBusinessDate(new Date());

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-display text-grey-400 uppercase">
            {isTonight ? "Tonight" : "Schedule"}
          </p>
          <h1 className="text-headline mt-2">
            {formatVenueDateLong(new Date(`${date}T12:00:00Z`))}
          </h1>
          <p className="mt-2 text-sm text-grey-400">
            Trading night — includes sessions running past midnight.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DateLink href={`/admin?date=${addVenueDays(date, -1)}`} label="Previous night">
            ←
          </DateLink>
          {!isTonight && (
            <Link
              href="/admin"
              className="font-display flex min-h-10 items-center border border-charcoal-line px-4 text-xs uppercase hover:border-lime"
            >
              Tonight
            </Link>
          )}
          <DateLink href={`/admin?date=${addVenueDays(date, 1)}`} label="Next night">
            →
          </DateLink>
        </div>
      </header>

      {/* Counters. Collected and outstanding are deliberately separate figures. */}
      <section aria-label="Summary" className="grid gap-px bg-charcoal-line sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Bookings tonight" value={String(counts.bookingsTonight)} />
        <Stat label="Confirmed" value={String(counts.confirmedTonight)} />
        <Stat
          label="Collected"
          value={formatPkr(counts.collectedTonightMinor)}
          note="Actually paid"
        />
        <Stat
          label="Still owed"
          value={formatPkr(counts.outstandingTonightMinor)}
          note="Expected, not collected"
        />
      </section>

      {/* Anything needing a human decision, surfaced rather than buried in a tab. */}
      {(counts.awaitingApproval > 0 ||
        counts.paymentsToVerify > 0 ||
        counts.tableRequestsPending > 0 ||
        counts.newInquiries > 0) && (
        <section aria-label="Needs attention" className="border border-pending p-5">
          <h2 className="font-display text-pending text-sm uppercase">Needs a decision</h2>
          <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {counts.awaitingApproval > 0 && (
              <li>
                <a href="#requests" className="underline decoration-pending decoration-2 underline-offset-4">
                  {counts.awaitingApproval} request{counts.awaitingApproval === 1 ? "" : "s"} awaiting a decision
                </a>
              </li>
            )}
            {counts.proofsToCheck > 0 && (
              <li>
                <Link href="/admin/payments" className="underline decoration-pending decoration-2 underline-offset-4">
                  {counts.proofsToCheck} JazzCash payment{counts.proofsToCheck === 1 ? "" : "s"} to check
                </Link>
              </li>
            )}
            {counts.paymentsToVerify > 0 && (
              <li>
                <Link href="/admin/payments" className="underline decoration-pending decoration-2 underline-offset-4">
                  {counts.paymentsToVerify} payment{counts.paymentsToVerify === 1 ? "" : "s"} to verify
                </Link>
              </li>
            )}
            {canViewTables && counts.tableRequestsPending > 0 && (
              <li>
                <a href="#table-requests" className="underline decoration-pending decoration-2 underline-offset-4">
                  {counts.tableRequestsPending} table request{counts.tableRequestsPending === 1 ? "" : "s"}
                </a>
              </li>
            )}
            {counts.newInquiries > 0 && (
              <li>
                <Link href="/admin/inquiries" className="underline decoration-pending decoration-2 underline-offset-4">
                  {counts.newInquiries} new enquir{counts.newInquiries === 1 ? "y" : "ies"}
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {/*
        The queue sits above the schedule: a request nobody has answered is more urgent
        than a booking that is already settled.
      */}
      <section id="requests" aria-label="Booking requests">
        <h2 className="font-display text-title mb-5">
          Requests awaiting a decision
          {pendingRequests.length > 0 && (
            <span className="ml-3 bg-pending px-2 py-0.5 text-sm text-charcoal" data-numeric="">
              {pendingRequests.length}
            </span>
          )}
        </h2>
        <RequestQueue requests={pendingRequests} />
      </section>

      {canViewTables && (
        <section id="table-requests" aria-label="Table reservation requests">
          <h2 className="font-display text-title mb-5">
            Table requests awaiting a decision
            {tableRequests.length > 0 && (
              <span className="ml-3 bg-pending px-2 py-0.5 text-sm text-charcoal" data-numeric="">
                {tableRequests.length}
              </span>
            )}
          </h2>
          {tableRequests.length === 0 ? (
            <div className="hatch border border-dashed border-charcoal-line p-8 text-center">
              <p className="font-display text-title">Nothing waiting</p>
              <p className="mt-2 text-sm text-grey-400">Every table request has been dealt with.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {tableRequests.map((request) => (
                <TableRequestRow
                  key={request.id}
                  request={{ ...request, startsAt: request.startsAt.toISOString() }}
                  tables={tables}
                  canDecide={canDecideTables}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {closures.length > 0 && (
        <section aria-label="Closures" className="border border-charcoal-line p-5">
          <h2 className="font-display text-sm uppercase">Courts closed tonight</h2>
          <ul className="mt-3 space-y-2 text-sm text-grey-300">
            {closures.map((closure) => (
              <li key={closure.id}>
                <span className="text-ivory">{closure.resourceName}</span> — {closure.reason}{" "}
                <span className="text-grey-400">
                  ({closure.kind === "maintenance" ? "maintenance" : "venue closure"})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DaySchedule
        date={date}
        entries={schedule}
        canCreate={["owner", "arena_manager", "reception"].includes(session.role)}
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="surface p-5">
      <p className="text-eyebrow font-display text-grey-400 uppercase">{label}</p>
      <p className="font-display mt-2 text-2xl" data-numeric="">
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-grey-400">{note}</p>}
    </div>
  );
}

function DateLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid size-10 place-items-center border border-charcoal-line hover:border-lime"
    >
      {children}
    </Link>
  );
}

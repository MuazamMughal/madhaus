import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/permissions";
import { formatPkr } from "@/lib/domain/money";
import {
  addVenueDays,
  venueBusinessDate,
  venueDateToInstant,
  VENUE_DAY_ROLLOVER_MINUTE,
} from "@/lib/domain/time";
import { pool } from "@/lib/db/client";

export const metadata: Metadata = { title: "Reports", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/reports
 *
 * The one rule this page exists to honour: money that has been collected is never shown
 * in the same number as money that is merely owed. Every figure here says which it is.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requirePermission("report.view");

  const params = await searchParams;
  const days = Number(Array.isArray(params.days) ? params.days[0] : params.days) || 30;
  const today = venueBusinessDate(new Date());
  const from = addVenueDays(today, -days);

  /*
   * Resolve the reporting window to absolute instants here rather than letting Postgres
   * cast a date to timestamptz. That cast uses the session time zone, so the same query
   * would silently report a different window on a connection whose time zone was not what
   * we expected -- and it would never be wrong by enough to look obviously wrong, only by
   * five hours at each edge. These two instants carry the venue's 05:00 rollover
   * explicitly, which is the boundary the business actually counts a night against.
   */
  const windowStart = venueDateToInstant(from, VENUE_DAY_ROLLOVER_MINUTE);
  const windowEnd = venueDateToInstant(addVenueDays(today, 1), VENUE_DAY_ROLLOVER_MINUTE);

  const [bySport, byResource, outcomes, cafe] = await Promise.all([
    pool().query(
      `SELECT s.name,
              count(*) FILTER (WHERE b.status <> 'cancelled')::int AS bookings,
              COALESCE(sum(b.amount_paid_minor) FILTER (WHERE b.status <> 'cancelled'), 0)::bigint AS collected,
              COALESCE(sum(b.total_minor - b.amount_paid_minor) FILTER (WHERE b.status IN ('confirmed','pending_approval')), 0)::bigint AS outstanding
         FROM bookings b JOIN sports s ON s.id = b.sport_id
        WHERE b.starts_at >= $1 AND b.starts_at < $2
        GROUP BY s.name ORDER BY bookings DESC`,
      [windowStart, windowEnd],
    ),
    pool().query(
      `SELECT r.name,
              count(*) FILTER (WHERE b.status <> 'cancelled')::int AS bookings,
              COALESCE(sum(b.duration_minutes) FILTER (WHERE b.status <> 'cancelled'), 0)::int AS booked_minutes
         FROM bookings b JOIN resources r ON r.id = b.resource_id
        WHERE b.starts_at >= $1 AND b.starts_at < $2
        GROUP BY r.name ORDER BY r.name`,
      [windowStart, windowEnd],
    ),
    pool().query(
      `SELECT status::text, count(*)::int AS n
         FROM bookings
        WHERE starts_at >= $1 AND starts_at < $2
        GROUP BY status ORDER BY n DESC`,
      [windowStart, windowEnd],
    ),
    pool().query(
      `SELECT count(*)::int AS orders,
              COALESCE(sum(total_minor), 0)::bigint AS total,
              COALESCE(sum(amount_paid_minor), 0)::bigint AS collected
         FROM cafe_orders
        WHERE created_at >= $1 AND status NOT IN ('cancelled','rejected')`,
      [windowStart],
    ),
  ]);

  const totalCollected = bySport.rows.reduce((sum, row) => sum + Number(row.collected), 0);
  const totalOutstanding = bySport.rows.reduce((sum, row) => sum + Number(row.outstanding), 0);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-headline">Reports</h1>
          <p className="mt-2 text-sm text-grey-400">
            Trading nights from {from} to {today}.
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <div>
            <label htmlFor="days" className="text-eyebrow font-display mb-2 block uppercase">
              Period
            </label>
            <select
              id="days"
              name="days"
              defaultValue={String(days)}
              className="min-h-11 border border-charcoal-line bg-transparent px-3 text-sm"
            >
              {[7, 30, 90, 365].map((value) => (
                <option key={value} value={value} className="bg-charcoal">
                  Last {value} days
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="font-display min-h-11 bg-lime px-4 text-xs text-charcoal uppercase">
            Apply
          </button>
        </form>
      </header>

      {/* The distinction that matters most on this page. */}
      <section className="grid gap-px bg-charcoal-line sm:grid-cols-2">
        <div className="surface p-6">
          <p className="text-eyebrow font-display text-grey-400 uppercase">Collected</p>
          <p className="font-display mt-2 text-3xl text-positive" data-numeric="">
            {formatPkr(totalCollected)}
          </p>
          <p className="mt-2 text-xs text-grey-400">
            Money actually received, from payment records. This is revenue.
          </p>
        </div>
        <div className="surface p-6">
          <p className="text-eyebrow font-display text-grey-400 uppercase">Still owed</p>
          <p className="font-display mt-2 text-3xl text-pending" data-numeric="">
            {formatPkr(totalOutstanding)}
          </p>
          <p className="mt-2 text-xs text-grey-400">
            Booked but unpaid, mostly pay-at-venue. Expected, not earned — do not add this to
            the figure on the left.
          </p>
        </div>
      </section>

      <ReportTable
        title="By sport"
        caption="Bookings and money by sport"
        headings={["Sport", "Bookings", "Collected", "Owed"]}
        rows={bySport.rows.map((row) => [
          row.name,
          String(row.bookings),
          formatPkr(Number(row.collected)),
          formatPkr(Number(row.outstanding)),
        ])}
      />

      <ReportTable
        title="Court occupancy"
        caption="Bookings and booked hours by physical court"
        headings={["Court", "Bookings", "Hours booked"]}
        rows={byResource.rows.map((row) => [
          row.name,
          String(row.bookings),
          (Number(row.booked_minutes) / 60).toFixed(1),
        ])}
        note="Counted per physical court, so football and cricket share one row — which is what the venue actually has."
      />

      <ReportTable
        title="Outcomes"
        caption="Bookings by final status"
        headings={["Status", "Count"]}
        rows={outcomes.rows.map((row) => [row.status.replace(/_/g, " "), String(row.n)])}
      />

      <ReportTable
        title="Café orders"
        caption="Café order totals"
        headings={["Orders", "Order value", "Collected"]}
        rows={[
          [
            String(cafe.rows[0]?.orders ?? 0),
            formatPkr(Number(cafe.rows[0]?.total ?? 0)),
            formatPkr(Number(cafe.rows[0]?.collected ?? 0)),
          ],
        ]}
      />

      <p className="text-xs text-grey-400">
        Refunds are tracked separately against each payment and are not netted off the collected
        figure above. Export the transaction list for a reconciled view.
      </p>
    </div>
  );
}

function ReportTable({
  title,
  caption,
  headings,
  rows,
  note,
}: {
  title: string;
  caption: string;
  headings: string[];
  rows: string[][];
  note?: string;
}) {
  return (
    <section>
      <h2 className="text-eyebrow font-display mb-4 uppercase">{title}</h2>
      {rows.length === 0 ? (
        <p className="border border-dashed border-charcoal-line p-6 text-sm text-grey-400">
          Nothing in this period.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-charcoal-line">
              {headings.map((heading, index) => (
                <th
                  key={heading}
                  scope="col"
                  className={`text-eyebrow font-display pb-3 uppercase ${index > 0 ? "text-right" : ""}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-line">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`py-3 ${cellIndex > 0 ? "text-right" : ""}`}
                    data-numeric={cellIndex > 0 ? "" : undefined}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {note && <p className="mt-3 text-xs text-grey-400">{note}</p>}
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BookingRow } from "@/components/admin/booking-row";
import { requirePermission } from "@/lib/auth/permissions";
import { BOOKING_STATUSES, humanBookingStatus } from "@/lib/domain/booking-state";
import { searchBookings } from "@/server/dashboard-queries";
import { getPublicSports } from "@/server/public-queries";

export const metadata: Metadata = { title: "Bookings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/bookings
 *
 * Search and filter, driven by search params so a filtered view is a URL staff can keep
 * open or send to a colleague. A plain GET form, so it works without JavaScript.
 */
export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const session = await requirePermission("booking.view");
  const params = await searchParams;

  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const query = first(params.q) ?? "";
  const status = first(params.status) ?? "";
  const sport = first(params.sport) ?? "";
  const from = first(params.from) ?? "";
  const to = first(params.to) ?? "";

  const [results, sports] = await Promise.all([
    searchBookings({
      query: query || undefined,
      status: status || undefined,
      sportSlug: sport || undefined,
      from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
      to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : undefined,
      limit: 200,
    }),
    getPublicSports(),
  ]);

  const canCancel = ["owner", "arena_manager"].includes(session.role);
  const canCheckIn = ["owner", "arena_manager", "reception"].includes(session.role);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-headline">Bookings</h1>
          <p className="mt-2 text-sm text-grey-400">
            Search by reference, name or phone number.
          </p>
        </div>
        {["owner", "arena_manager", "reception"].includes(session.role) && (
          <Link
            href="/admin/bookings/new"
            className="font-display flex min-h-11 items-center bg-lime px-5 text-xs text-charcoal uppercase"
          >
            + New booking
          </Link>
        )}
      </header>

      <form method="get" className="grid gap-4 border border-charcoal-line p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="text-eyebrow font-display mb-2 block uppercase">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="MH-7F3K2Q9X, name, or 0300…"
            className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm focus:border-lime"
          />
        </div>

        <div>
          <label htmlFor="status" className="text-eyebrow font-display mb-2 block uppercase">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm"
          >
            <option value="" className="bg-charcoal">Any</option>
            {BOOKING_STATUSES.map((value) => (
              <option key={value} value={value} className="bg-charcoal">
                {humanBookingStatus(value)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sport" className="text-eyebrow font-display mb-2 block uppercase">
            Sport
          </label>
          <select
            id="sport"
            name="sport"
            defaultValue={sport}
            className="min-h-11 w-full border border-charcoal-line bg-transparent px-3 text-sm"
          >
            <option value="" className="bg-charcoal">Any</option>
            {sports.map((entry) => (
              <option key={entry.slug} value={entry.slug} className="bg-charcoal">
                {entry.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="font-display min-h-11 flex-1 bg-lime px-4 text-xs text-charcoal uppercase"
          >
            Search
          </button>
          <Link
            href="/admin/bookings"
            className="font-display flex min-h-11 items-center border border-charcoal-line px-4 text-xs uppercase"
          >
            Clear
          </Link>
        </div>
      </form>

      <p aria-live="polite" className="text-sm text-grey-400">
        {results.length === 0
          ? "No bookings match."
          : `${results.length} booking${results.length === 1 ? "" : "s"}.`}
      </p>

      {results.length === 0 ? (
        <div className="hatch border border-dashed border-charcoal-line p-10 text-center">
          <p className="font-display text-title">Nothing found</p>
          <p className="mt-2 text-sm text-grey-400">
            Try a shorter search, or clear the filters.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-charcoal-line border-y border-charcoal-line">
          {results.map((entry) => (
            <BookingRow
              key={entry.id}
              entry={{
                ...entry,
                startsAt: entry.startsAt.toISOString(),
                endsAt: entry.endsAt.toISOString(),
                checkedInAt: entry.checkedInAt?.toISOString() ?? null,
              }}
              canCancel={canCancel}
              canCheckIn={canCheckIn}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

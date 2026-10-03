import type { Metadata } from "next";
import { WalkInForm } from "@/components/admin/walk-in-form";
import { requirePermission } from "@/lib/auth/permissions";
import { formatVenueDate, venueBusinessDate } from "@/lib/domain/time";
import { loadSportBySlug } from "@/server/booking-service";
import { getPublicSports } from "@/server/public-queries";

export const metadata: Metadata = { title: "New booking", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/bookings/new
 *
 * A booking taken at the desk or over the phone. It goes straight to confirmed, but runs
 * through exactly the same overlap checks as an online booking — a walk-in cannot be
 * written over a customer's reservation.
 */
export default async function NewBookingPage({ searchParams }: PageProps<"/admin/bookings/new">) {
  await requirePermission("booking.create");

  const params = await searchParams;
  const requested = Array.isArray(params.date) ? params.date[0] : params.date;
  const date =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : venueBusinessDate(new Date());

  const sports = await getPublicSports();
  const durationsBySport: Record<string, number[]> = {};
  for (const sport of sports) {
    const loaded = await loadSportBySlug(sport.slug);
    durationsBySport[sport.slug] = loaded ? [...loaded.sport.allowedDurations] : [60];
  }

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-headline">New booking</h1>
        <p className="mt-2 text-sm text-grey-400">
          For a walk-in or a phone call. Confirmed immediately, and checked against the same
          overlap rules as an online booking.
        </p>
      </header>

      <WalkInForm
        sports={sports.map((sport) => ({ slug: sport.slug, name: sport.name }))}
        durationsBySport={durationsBySport}
        defaultDate={date}
        today={formatVenueDate(new Date())}
      />
    </div>
  );
}

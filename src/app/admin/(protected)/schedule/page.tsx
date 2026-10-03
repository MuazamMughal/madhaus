import type { Metadata } from "next";
import { OpeningHoursEditor } from "@/components/admin/opening-hours-editor";
import { requirePermission } from "@/lib/auth/permissions";
import { listOpeningHours } from "@/server/venue-config-service";

export const metadata: Metadata = { title: "Opening hours", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/schedule
 *
 * When the venue is open. Everything downstream reads from this — which slots exist on
 * /book, what counts as a trading night on the dashboard, and whether a time is inside
 * opening hours when a booking is made.
 */
export default async function SchedulePage() {
  await requirePermission("schedule.manage");

  const hours = await listOpeningHours();
  const openDays = hours.filter((day) => !day.isClosed);
  const totalHours = openDays.reduce((sum, day) => sum + day.openHours, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-headline">Opening hours</h1>
        <p className="mt-2 max-w-2xl text-sm text-grey-400">
          These decide which times appear on the booking page. A day that closes after
          midnight is normal here and handled automatically — just set the closing time
          earlier than the opening one.
        </p>
      </header>

      <div className="grid gap-px bg-charcoal-line sm:grid-cols-3">
        <Stat label="Open" value={`${openDays.length} day${openDays.length === 1 ? "" : "s"} a week`} />
        <Stat label="Hours a week" value={`${Math.round(totalHours * 10) / 10}`} />
        <Stat
          label="Longest night"
          value={
            openDays.length > 0
              ? `${Math.max(...openDays.map((d) => d.openHours))} hours`
              : "—"
          }
        />
      </div>

      <p className="border-l-4 border-pending bg-charcoal-raised p-4 text-sm text-grey-200">
        Shortening a day does <strong>not</strong> cancel anything. Bookings already made
        outside the new hours stay in the diary, and the dashboard will still show them —
        move or cancel them yourself if you need to.
      </p>

      <OpeningHoursEditor hours={hours} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface p-5">
      <p className="text-eyebrow font-display text-grey-400 uppercase">{label}</p>
      <p className="font-display mt-2 text-xl" data-numeric="">
        {value}
      </p>
    </div>
  );
}

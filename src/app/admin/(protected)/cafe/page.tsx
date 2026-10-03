import type { Metadata } from "next";
import { TableRequestRow } from "@/components/admin/table-request-row";
import { requirePermission } from "@/lib/auth/permissions";
import { pool } from "@/lib/db/client";
import { listTableRequests } from "@/server/cafe-service";
import { getFeatureFlags } from "@/server/public-queries";

export const metadata: Metadata = { title: "Café", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/cafe
 *
 * The table queue. Pickup ordering is off, and this page says so rather than showing an
 * empty queue that looks like a quiet night.
 */
export default async function CafeAdminPage() {
  await requirePermission("cafe.reservation.view");

  const [requests, flags, tables] = await Promise.all([
    listTableRequests({ limit: 200 }),
    getFeatureFlags(),
    pool().query<{ id: string; label: string; seats: number }>(
      "SELECT id, label, seats FROM cafe_tables WHERE is_active ORDER BY label",
    ),
  ]);

  const pending = requests.filter((request) => request.status === "requested");
  const decided = requests.filter((request) => request.status !== "requested");

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-headline">Café</h1>
        <p className="mt-2 text-sm text-grey-400">Table requests waiting on a decision.</p>
      </header>

      <section>
        <h2 className="text-eyebrow font-display mb-4 uppercase">
          Awaiting a decision ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <div className="hatch border border-dashed border-charcoal-line p-8 text-center">
            <p className="font-display text-title">Nothing waiting</p>
            <p className="mt-2 text-sm text-grey-400">All table requests have been dealt with.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {pending.map((request) => (
              <TableRequestRow
                key={request.id}
                request={{ ...request, startsAt: request.startsAt.toISOString() }}
                tables={tables.rows}
              />
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="text-eyebrow font-display mb-4 uppercase">Recently decided</h2>
          <ul className="divide-y divide-charcoal-line border-y border-charcoal-line text-sm">
            {decided.slice(0, 20).map((request) => (
              <li key={request.id} className="flex flex-wrap justify-between gap-3 py-3">
                <span>
                  <span data-numeric="">{request.reference}</span> — {request.customerName} ·{" "}
                  {request.partySize} people
                </span>
                <span className="text-grey-400">
                  {request.status}
                  {request.tableLabel && ` · ${request.tableLabel}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Honest statement of what the café can and cannot do online right now. */}
      <section className="border-t border-charcoal-line pt-8">
        <h2 className="text-eyebrow font-display mb-4 uppercase">Café services</h2>
        <ul className="divide-y divide-charcoal-line border-y border-charcoal-line text-sm">
          <FlagRow label="Table requests" on={flags["cafe.tableReservations"] === true} />
          <FlagRow
            label="Instant table confirmation"
            on={flags["cafe.tableInstantConfirm"] === true}
            note="Needs real table capacity before it can be switched on honestly."
          />
          <FlagRow
            label="Online pickup ordering"
            on={flags["cafe.pickupOrders"] === true}
            note="Off until the kitchen confirms it will run an online queue."
          />
          <FlagRow label="Café add-ons on court bookings" on={flags["cafe.courtAddons"] === true} />
          <FlagRow
            label="Delivery"
            on={flags["cafe.delivery"] === true}
            note="Advertised on Instagram, but no delivery operation is built here."
          />
        </ul>
      </section>
    </div>
  );
}

function FlagRow({ label, on, note }: { label: string; on: boolean; note?: string }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <span>
        {label}
        {note && <span className="mt-0.5 block text-xs text-grey-400">{note}</span>}
      </span>
      <span className={on ? "text-positive" : "text-grey-400"}>
        <span aria-hidden="true">{on ? "✓ " : "• "}</span>
        {on ? "On" : "Off"}
      </span>
    </li>
  );
}

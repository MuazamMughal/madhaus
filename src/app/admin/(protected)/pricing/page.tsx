import type { Metadata } from "next";
import { PricingEditor } from "@/components/admin/pricing-editor";
import { requirePermission } from "@/lib/auth/permissions";
import { pool } from "@/lib/db/client";
import { findPricingGaps, listPricingRules } from "@/server/venue-config-service";
import { getFeatureFlags } from "@/server/public-queries";

export const metadata: Metadata = { title: "Rates", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/pricing
 *
 * Court rates. The venue sets these themselves — it is the single most common change they
 * will want to make, and until this page existed it needed a developer and a SQL client.
 *
 * Two things the page is careful to say out loud: a rate change never touches a booking
 * already made, and a gap in the rate table means customers simply cannot book that time.
 */
export default async function PricingPage() {
  await requirePermission("pricing.manage");

  const [rules, sports, gaps, flags] = await Promise.all([
    listPricingRules(),
    pool().query<{ id: string; name: string }>(
      "SELECT id, name FROM sports WHERE is_active ORDER BY sort_order, name",
    ),
    findPricingGaps(),
    getFeatureFlags(),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-headline">Court rates</h1>
        <p className="mt-2 max-w-2xl text-sm text-grey-400">
          Prices are worked out per minute across these bands, so a session that starts
          off-peak and runs into peak is charged for exactly what it uses.
        </p>
      </header>

      {/* The thing people worry about when they change a price. */}
      <p className="border-l-4 border-lime bg-charcoal-raised p-4 text-sm text-grey-200">
        Changing a rate affects <strong>new bookings only</strong>. Every booking already made
        keeps the price it was quoted — that price is frozen onto the booking when it is
        created.
      </p>

      {flags["pricing.isSample"] && (
        <p className="border-l-4 border-pending bg-charcoal-raised p-4 text-sm">
          <strong className="text-pending">These are still the placeholder rates.</strong> Once
          you have put the real prices in, turn off <code>pricing.isSample</code> in Settings
          and the &ldquo;indicative&rdquo; notes disappear from the public site.
        </p>
      )}

      {/* A gap is not cosmetic: the engine refuses to quote an unpriced minute. */}
      {gaps.length > 0 && (
        <div className="border-2 border-negative p-5">
          <h2 className="font-display text-sm text-negative uppercase">
            Some times cannot be booked
          </h2>
          <p className="mt-2 text-sm text-grey-200">
            These times have no rate, so the system refuses to price them rather than charging
            zero. Customers cannot book them until a rate covers them.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {gaps.map((gap) => (
              <li key={gap.sportSlug}>
                <span className="font-semibold">{gap.sportName}</span>{" "}
                <span className="text-grey-300" data-numeric="">
                  — {gap.gaps.slice(0, 8).join(", ")}
                  {gap.gaps.length > 8 && ` and ${gap.gaps.length - 8} more`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PricingEditor rules={rules} sports={sports.rows} />
    </div>
  );
}

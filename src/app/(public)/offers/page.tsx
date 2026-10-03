import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { formatPkr } from "@/lib/domain/money";
import { pool } from "@/lib/db/client";
import { getFeatureFlags } from "@/server/public-queries";

export const metadata: Metadata = {
  title: "Offers",
  description: "Current offers and packages at MadHaus in Sahiwal.",
  alternates: { canonical: "/offers" },
};

/**
 * /offers
 *
 * Offers shown here come from the coupons table, so what is advertised is exactly what
 * the server will honour at checkout. Expired and exhausted offers disappear on their
 * own — the query does the filtering, not an editor remembering to unpublish something.
 */
export default async function OffersPage() {
  const flags = await getFeatureFlags();

  const { rows } = await pool().query(
    `SELECT code, label, kind, discount_bps, discount_minor, min_subtotal_minor, valid_to,
            max_redemptions, redemption_count
       FROM coupons
      WHERE is_active
        AND (valid_from IS NULL OR valid_from <= now())
        AND (valid_to IS NULL OR valid_to >= now())
        AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
      ORDER BY created_at DESC`,
  );

  return (
    <>
      <PageHero
        surface="lime"
        eyebrow="Offers"
        title="Worth turning up for."
        lead="Anything running right now is listed here. What you see is what the checkout will actually take off."
      />

      <Section surface="dark" spacing="tight">
        <div className="shell">
          {rows.length === 0 ? (
            <div className="hatch border border-dashed border-charcoal-line p-10 text-center">
              <p className="font-display text-title">No offers running at the moment</p>
              <p className="mx-auto mt-3 max-w-lg text-sm text-grey-300">
                Nothing is on right now. When the venue puts something together it will appear
                here — and it will be a real discount the booking system honours, not a banner.
              </p>
              <div className="mt-8">
                <ButtonLink href="/book">Book a court</ButtonLink>
              </div>
            </div>
          ) : (
            <ul className="grid gap-px bg-charcoal-line md:grid-cols-2">
              {rows.map((offer) => (
                <li key={offer.code} className="surface p-6 sm:p-8">
                  <p className="font-display text-headline text-lime">
                    {offer.kind === "percent"
                      ? `${(offer.discount_bps / 100).toFixed(0)}% off`
                      : `${formatPkr(offer.discount_minor)} off`}
                  </p>
                  <h2 className="text-title mt-3">{offer.label}</h2>

                  <dl className="mt-6 space-y-2 text-sm text-grey-300">
                    <div className="flex justify-between gap-3">
                      <dt>Code</dt>
                      <dd className="font-display text-ivory" data-numeric="">
                        {offer.code}
                      </dd>
                    </div>
                    {offer.min_subtotal_minor > 0 && (
                      <div className="flex justify-between gap-3">
                        <dt>Minimum spend</dt>
                        <dd data-numeric="">{formatPkr(offer.min_subtotal_minor)}</dd>
                      </div>
                    )}
                    {offer.valid_to && (
                      <div className="flex justify-between gap-3">
                        <dt>Ends</dt>
                        <dd data-numeric="">
                          {new Intl.DateTimeFormat("en-GB", {
                            timeZone: "Asia/Karachi",
                            day: "numeric",
                            month: "long",
                          }).format(new Date(offer.valid_to))}
                        </dd>
                      </div>
                    )}
                    {offer.max_redemptions !== null && (
                      <div className="flex justify-between gap-3">
                        <dt>Left</dt>
                        <dd data-numeric="">{offer.max_redemptions - offer.redemption_count}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-8">
                    <ButtonLink href="/book" size="sm">
                      Use it
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {flags["pricing.isSample"] && rows.length > 0 && (
            <p className="mt-8 text-xs text-grey-400">
              Prices these discounts apply to are placeholders pending the venue&apos;s confirmed
              price list.
            </p>
          )}
        </div>
      </Section>
    </>
  );
}

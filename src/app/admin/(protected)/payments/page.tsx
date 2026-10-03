import type { Metadata } from "next";
import { ProofReview } from "@/components/admin/proof-review";
import { requirePermission } from "@/lib/auth/permissions";
import { formatPkr } from "@/lib/domain/money";
import { formatVenueDateTimeShort } from "@/lib/domain/time";
import { listPendingProofs } from "@/server/payment-proof-service";
import { adapterReadiness } from "@/lib/payments/adapters";
import { notificationReadiness } from "@/lib/notifications/adapters";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/payments
 *
 * JazzCash transfers customers say they have made. Nothing here is auto-approved: a
 * transaction reference is a claim until somebody has looked at the account.
 */
export default async function PaymentsPage() {
  await requirePermission("payment.verify");

  const [proofs, adapters, messaging] = await Promise.all([
    listPendingProofs(),
    Promise.resolve(adapterReadiness()),
    Promise.resolve(notificationReadiness()),
  ]);

  const env = serverEnv();
  const jazzCashConfigured = Boolean(env.JAZZCASH_ACCOUNT_TITLE && env.JAZZCASH_ACCOUNT_NUMBER);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-headline">Payments</h1>
        <p className="mt-2 text-sm text-grey-400">
          Check each transaction ID against the JazzCash account before confirming.
        </p>
      </header>

      {proofs.length === 0 ? (
        <div className="hatch border border-dashed border-charcoal-line p-10 text-center">
          <p className="font-display text-title">Nothing to check</p>
          <p className="mt-2 text-sm text-grey-400">
            No payments are waiting on a decision right now.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {proofs.map((proof) => (
            <li key={proof.id} className="border border-pending p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display text-lg" data-numeric="">
                    {proof.reference}
                  </p>
                  <p className="mt-1 text-sm">
                    {proof.customerName}{" "}
                    <span className="text-grey-400" data-numeric="">
                      · {proof.customerPhone}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-grey-400">
                    {proof.sportName} · {formatVenueDateTimeShort(proof.startsAt)}
                  </p>

                  <dl className="mt-4 space-y-1.5 text-sm">
                    <div className="flex gap-3">
                      <dt className="w-32 shrink-0 text-grey-400">Transaction ID</dt>
                      <dd className="font-display select-all" data-numeric="">
                        {proof.transactionReference}
                      </dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="w-32 shrink-0 text-grey-400">Paid from</dt>
                      <dd className="break-all">{proof.payerEmail}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="w-32 shrink-0 text-grey-400">Submitted</dt>
                      <dd>{formatVenueDateTimeShort(proof.submittedAt)}</dd>
                    </div>
                  </dl>

                  {proof.hasScreenshot && (
                    <a
                      href={`/admin/payments/proof/${proof.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-block text-sm underline decoration-lime decoration-2 underline-offset-4"
                    >
                      View the screenshot
                    </a>
                  )}
                </div>

                <p className="font-display shrink-0 text-2xl text-lime" data-numeric="">
                  {formatPkr(proof.totalMinor)}
                </p>
              </div>

              <div className="mt-5 border-t border-charcoal-line pt-5">
                <ProofReview
                  proofId={proof.id}
                  reference={proof.reference}
                  amountLabel={formatPkr(proof.totalMinor)}
                  transactionReference={proof.transactionReference}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* An honest statement of what is and is not set up. */}
      <section className="border-t border-charcoal-line pt-8">
        <h2 className="text-eyebrow font-display mb-4 uppercase">How money comes in</h2>
        <ul className="divide-y divide-charcoal-line border-y border-charcoal-line text-sm">
          {adapters.map((adapter) => (
            <li key={adapter.id} className="flex flex-wrap justify-between gap-3 py-3">
              <span>{adapter.label}</span>
              <span className="flex gap-3">
                <span className={adapter.enabled ? "text-positive" : "text-grey-400"}>
                  {adapter.enabled ? "Enabled" : "Off"}
                </span>
                {!adapter.productionSafe && (
                  <span className="font-display bg-pending px-2 text-[10px] text-charcoal uppercase">
                    Dev only
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {!jazzCashConfigured && (
          <p className="mt-4 border-l-4 border-pending bg-charcoal-raised p-4 text-sm">
            <strong>JazzCash account details are not set.</strong> Until{" "}
            <code>JAZZCASH_ACCOUNT_TITLE</code> and <code>JAZZCASH_ACCOUNT_NUMBER</code> are
            configured, customers cannot choose to pay online — only pay-at-venue is offered.
          </p>
        )}

        <h2 className="text-eyebrow font-display mt-8 mb-4 uppercase">Email</h2>
        <ul className="divide-y divide-charcoal-line border-y border-charcoal-line text-sm">
          {messaging.map((channel) => (
            <li key={channel.channel} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <span>
                {channel.channel}
                <span className="mt-0.5 block text-xs text-grey-400">{channel.note}</span>
              </span>
              <span className={channel.configured ? "text-positive" : "text-negative"}>
                {channel.configured ? "Sending" : "Not sending"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { SettingRow } from "@/components/admin/setting-row";
import { requirePermission } from "@/lib/auth/permissions";
import { pool } from "@/lib/db/client";
import { adapterReadiness } from "@/lib/payments/adapters";
import { notificationReadiness } from "@/lib/notifications/adapters";
import { isSanityConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/settings
 *
 * The operational switches, plus an honest integration status board. The second half is
 * the important part: it tells the venue exactly which live integrations are real and
 * which are still placeholders, so nobody launches believing a message will be sent.
 */
export default async function SettingsPage() {
  await requirePermission("settings.manage");

  const { rows } = await pool().query<{ key: string; value: unknown; description: string | null }>(
    "SELECT key, value, description FROM settings ORDER BY key",
  );

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const prefix = row.key.split(".")[0];
    groups.set(prefix, [...(groups.get(prefix) ?? []), row]);
  }

  const payments = adapterReadiness();
  const notifications = notificationReadiness();
  const sanityReady = isSanityConfigured();

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-headline">Settings</h1>
        <p className="mt-2 text-sm text-grey-400">
          Operational switches. Anything half-built stays off so it cannot appear publicly.
        </p>
      </header>

      {[...groups.entries()].map(([group, settings]) => (
        <section key={group}>
          <h2 className="text-eyebrow font-display mb-4 uppercase">{group}</h2>
          <ul className="divide-y divide-charcoal-line border-y border-charcoal-line">
            {settings.map((setting) => (
              <SettingRow
                key={setting.key}
                settingKey={setting.key}
                value={setting.value}
                description={setting.description}
              />
            ))}
          </ul>
        </section>
      ))}

      <section className="border-t border-charcoal-line pt-10">
        <h2 className="text-headline mb-2">Integration status</h2>
        <p className="mb-6 text-sm text-grey-400">
          What is genuinely connected, and what is still a placeholder.
        </p>

        <h3 className="text-eyebrow font-display mb-3 uppercase">Payments</h3>
        <ul className="mb-8 divide-y divide-charcoal-line border-y border-charcoal-line text-sm">
          {payments.map((adapter) => (
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
          <li className="py-3 text-grey-400">
            Online card gateway —{" "}
            <span className="text-negative">not connected, and not verified for this merchant.</span>
          </li>
        </ul>

        <h3 className="text-eyebrow font-display mb-3 uppercase">Messaging</h3>
        <ul className="mb-8 divide-y divide-charcoal-line border-y border-charcoal-line text-sm">
          {notifications.map((channel) => (
            <li key={channel.channel} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <span>
                {channel.channel}
                <span className="mt-0.5 block text-xs text-grey-400">{channel.note}</span>
              </span>
              <span className={channel.configured ? "text-pending" : "text-grey-400"}>
                {channel.configured ? "Credentials present" : "Not configured"}
              </span>
            </li>
          ))}
        </ul>

        <h3 className="text-eyebrow font-display mb-3 uppercase">Content</h3>
        <ul className="divide-y divide-charcoal-line border-y border-charcoal-line text-sm">
          <li className="flex justify-between gap-3 py-3">
            <span>Sanity CMS</span>
            <span className={sanityReady ? "text-positive" : "text-grey-400"}>
              {sanityReady ? "Connected" : "Not configured — the site is on sample content"}
            </span>
          </li>
        </ul>

        <p className="mt-6 text-xs text-grey-400">
          Full detail, and what each integration needs before it can go live, is in
          docs/INTEGRATIONS.md.
        </p>
      </section>
    </div>
  );
}

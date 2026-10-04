import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { MediaPanel } from "@/components/ui/media-panel";
import { PageHero } from "@/components/ui/page-hero";
import { Reveal } from "@/components/ui/reveal";
import { Lead, Section, SectionHeading } from "@/components/ui/section";
import { formatPkr } from "@/lib/domain/money";
import { formatLocalTime12h, formatVenueDate } from "@/lib/domain/time";
import { getDayAvailability, loadPricingRules, loadSportBySlug } from "@/server/booking-service";
import { getFeatureFlags, getHoursLabel, getPublicSports } from "@/server/public-queries";
import { getSiteSettings } from "@/lib/content";

/**
 * /arena/[sport]
 *
 * One page per sport, generated from the sports that are actually active. A sport the
 * venue has switched off 404s rather than rendering a page for something that is not on
 * offer.
 */

/*
 * Rendered per request.
 *
 * This page shows tonight's remaining slots. Prerendered -- which is the default, and
 * what it used to be -- those slots would be frozen at whatever was free when the site
 * was last built and would then be served from the CDN for days, telling customers a
 * court is open when it was booked last Tuesday. A stale availability claim is worse than
 * no claim, and the section below promises a live one.
 *
 * The rest of the page is configuration that changes rarely, so the cost is a few cheap
 * queries per view rather than a rebuild. `/book` is dynamic for the same reason.
 *
 * `generateStaticParams` was removed with this change: it only informs prerendering, so
 * leaving it would imply a static route that no longer exists. A slug with no active
 * sport still 404s, via the `notFound()` calls below.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/arena/[sport]">): Promise<Metadata> {
  const { sport: slug } = await params;
  const sports = await getPublicSports();
  const sport = sports.find((entry) => entry.slug === slug);
  const settings = await getSiteSettings();

  if (!sport) return { title: "Not found", robots: { index: false, follow: false } };

  return {
    title: sport.name,
    description: `${sport.blurb} Book a ${sport.name.toLowerCase()} court at ${settings.brandName} in ${settings.city}.`,
    alternates: { canonical: `/arena/${sport.slug}` },
    openGraph: { title: `${sport.name} at ${settings.brandName}`, description: sport.blurb },
  };
}

export default async function SportPage({ params }: PageProps<"/arena/[sport]">) {
  const { sport: slug } = await params;

  const sports = await getPublicSports();
  const summary = sports.find((entry) => entry.slug === slug);
  if (!summary) notFound();

  const loaded = await loadSportBySlug(slug);
  if (!loaded) notFound();

  const [rules, hoursLabel, flags] = await Promise.all([
    loadPricingRules(loaded.sport.id),
    getHoursLabel(),
    getFeatureFlags(),
  ]);

  // Tonight's remaining slots, as a live taste of availability rather than a claim.
  const today = formatVenueDate(new Date());
  let tonight: Awaited<ReturnType<typeof getDayAvailability>> | null = null;
  try {
    tonight = await getDayAvailability({
      date: today,
      sportSlug: slug,
      durationMinutes: loaded.sport.defaultDuration,
    });
  } catch {
    tonight = null;
  }
  const openTonight = tonight?.slots.filter((slot) => slot.available).slice(0, 6) ?? [];

  const rateRows = rules
    .filter((rule) => rule.sportId === loaded.sport.id)
    .sort((a, b) => a.startsAtMinute - b.startsAtMinute || b.priority - a.priority);

  const motif = summary.courtNote?.includes("shared with") ? "pitch" : "padel";

  return (
    <>
      <PageHero
        eyebrow={summary.courtNote?.includes("shared with") ? "Multipurpose court" : "Dedicated court"}
        title={summary.name}
        accent="at MadHaus."
        lead={summary.blurb}
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/book?sport=${slug}`} size="lg">
            Book {summary.name.toLowerCase()}
          </ButtonLink>
          <ButtonLink href="/menu" size="lg" variant="secondary">
            See the menu
          </ButtonLink>
        </div>
      </PageHero>

      {/* Live availability for tonight. Genuinely live -- never a fabricated "3 slots left". */}
      <Section surface="dark" spacing="tight" ariaLabel="Availability tonight">
        <div className="shell">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="text-eyebrow font-display uppercase">Tonight</h2>
            <Link
              href={`/book?sport=${slug}`}
              className="text-sm underline decoration-lime decoration-2 underline-offset-4"
            >
              See the full calendar
            </Link>
          </div>

          {openTonight.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {openTonight.map((slot) => (
                <li key={slot.startsAtLocal}>
                  <Link
                    href={`/book?sport=${slug}&date=${today}&duration=${loaded.sport.defaultDuration}&start=${slot.startsAtLocal}`}
                    className="font-display flex min-h-12 items-center border border-charcoal-line px-5 text-sm transition-colors hover:border-lime hover:text-lime"
                    data-numeric=""
                  >
                    {slot.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-grey-400">
              {tonight?.isClosed
                ? (tonight.closedReason ?? "Closed tonight.")
                : "Nothing left tonight — try another night."}
            </p>
          )}
        </div>
      </Section>

      <Section surface="dark" index="01" eyebrow="The court">
        <div className="shell grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <Reveal>
            <MediaPanel
              image={summary.image}
              aspect="landscape"
              motif={motif}
              sizes="(max-width: 1024px) 100vw, 50vw"
              placeholderLabel={`${summary.name} — the court in play`}
            />
          </Reveal>
          <Reveal delay={1}>
            <SectionHeading className="max-w-[16ch]">
              {loaded.resource.name}
            </SectionHeading>
            <Lead className="mt-6">{summary.courtNote}</Lead>

            <dl className="mt-10 grid gap-px bg-charcoal-line sm:grid-cols-2">
              <Fact label="Session lengths" value={loaded.sport.allowedDurations.map((d) => (d >= 60 ? `${d / 60}h` : `${d}m`)).join(" · ")} />
              {hoursLabel && <Fact label="Open" value={hoursLabel} />}
              {loaded.sport.slotStepMinutes && (
                <Fact label="Start times" value={`Every ${loaded.sport.slotStepMinutes} minutes`} />
              )}
              {loaded.resource.sportChangeBufferMinutes > 0 && (
                <Fact
                  label="Changeover"
                  value={`${loaded.resource.sportChangeBufferMinutes} min between sports`}
                />
              )}
            </dl>

            <p className="mt-6 text-xs text-grey-400">
              Court dimensions, surface and equipment details are being confirmed with the venue.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* Rates, straight from the pricing table the booking engine actually charges from. */}
      {rateRows.length > 0 && (
        <Section surface="ivory" index="02" eyebrow="Rates">
          <div className="shell shell-content">
            <SectionHeading className="max-w-[16ch]">
              What it <span className="text-orange">costs.</span>
            </SectionHeading>

            <table className="mt-10 w-full text-left">
              <caption className="sr-only">
                {summary.name} court rates by time of night
              </caption>
              <thead>
                <tr className="border-b-2 border-[var(--surface-line)]">
                  <th scope="col" className="text-eyebrow font-display pb-3 uppercase">When</th>
                  <th scope="col" className="text-eyebrow font-display pb-3 uppercase">Band</th>
                  <th scope="col" className="text-eyebrow font-display pb-3 text-right uppercase">Per hour</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--surface-line)]">
                {rateRows.map((rule) => (
                  <tr key={rule.id}>
                    <td className="py-4" data-numeric="">
                      {formatLocalTime12h(rule.startsAtMinute)} – {formatLocalTime12h(rule.endsAtMinute)}
                      {rule.daysOfWeek.length > 0 && (
                        <span className="ml-2 text-xs text-[var(--surface-muted)]">
                          {rule.daysOfWeek.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="py-4 text-sm">
                      {rule.isPeak ? (
                        <span className="font-display text-xs tracking-wider text-orange uppercase">Peak</span>
                      ) : (
                        <span className="text-xs text-[var(--surface-muted)]">Off-peak</span>
                      )}
                    </td>
                    <td className="py-4 text-right font-medium" data-numeric="">
                      {formatPkr(rule.rateMinorPerHour)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-6 text-sm text-[var(--surface-muted)]">
              Sessions are priced by the minute across these bands, so a booking that starts
              off-peak and runs into peak is charged for exactly what it uses. The total is always
              shown before you confirm.
            </p>

            {flags["pricing.isSample"] && (
              <p className="mt-4 border-l-4 border-orange bg-[var(--surface-raised)] p-4 text-sm">
                <strong>These are placeholder rates.</strong> The venue&apos;s confirmed price list
                has not been supplied yet.
              </p>
            )}
          </div>
        </Section>
      )}

      <Section surface="dark" spacing="loose" ariaLabel={`Book ${summary.name}`}>
        <div className="shell text-center">
          <SectionHeading className="mx-auto max-w-[20ch]">
            Ready when <span className="text-lime">you are.</span>
          </SectionHeading>
          <div className="mt-10">
            <ButtonLink href={`/book?sport=${slug}`} size="lg">
              Book {summary.name.toLowerCase()}
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface p-5">
      <dt className="text-eyebrow font-display text-grey-400 uppercase">{label}</dt>
      <dd className="mt-2 font-medium" data-numeric="">
        {value}
      </dd>
    </div>
  );
}

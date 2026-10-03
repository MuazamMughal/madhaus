import { ButtonLink } from "@/components/ui/button";
import { addVenueDays, formatVenueDate, formatVenueDateLong } from "@/lib/domain/time";

/**
 * Homepage quick-booking strip.
 *
 * A plain GET form pointed at /book. That is deliberate: it works with JavaScript
 * disabled, it needs no client bundle, and the resulting URL is shareable and
 * bookmarkable. The real slot picking happens on /book, where the server can be
 * authoritative about what is free.
 */
export function QuickBooking({
  sports,
  now = new Date(),
}: {
  sports: Array<{ slug: string; name: string; courtNote: string | null }>;
  now?: Date;
}) {
  const today = formatVenueDate(now);
  // Seven nights is as far as a "quick" picker should reach; /book has the full calendar.
  const dates = Array.from({ length: 7 }, (_, offset) => addVenueDays(today, offset));

  const shared = sports.filter((sport) => sport.courtNote?.includes("shared with"));
  const sharedNote =
    shared.length > 1
      ? `${shared.map((sport) => sport.name).join(" and ")} share one multipurpose court, so booking either takes that time off the board for both.`
      : null;

  return (
    <form
      action="/book"
      method="get"
      data-surface="lime"
      className="surface shell-content relative grid gap-4 p-5 sm:p-7 md:grid-cols-[1fr_1fr_auto] md:items-end"
      aria-label="Check court availability"
    >
      <div>
        <label htmlFor="quick-sport" className="text-eyebrow font-display mb-2 block uppercase">
          What are you playing?
        </label>
        <select
          id="quick-sport"
          name="sport"
          defaultValue={sports[0]?.slug}
          className="min-h-12 w-full border-2 border-charcoal bg-transparent px-3 text-base font-medium"
        >
          {sports.map((sport) => (
            <option key={sport.slug} value={sport.slug}>
              {sport.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="quick-date" className="text-eyebrow font-display mb-2 block uppercase">
          Which night?
        </label>
        <select
          id="quick-date"
          name="date"
          defaultValue={today}
          className="min-h-12 w-full border-2 border-charcoal bg-transparent px-3 text-base font-medium"
        >
          {dates.map((date, index) => (
            <option key={date} value={date}>
              {index === 0 ? "Tonight" : formatVenueDateLong(new Date(`${date}T12:00:00Z`))}
            </option>
          ))}
        </select>
      </div>

      <ButtonLink href="/book" size="lg" variant="primary" className="md:hidden">
        See available times
      </ButtonLink>
      {/* On wider screens the real submit button is used, so the form posts its values. */}
      <button
        type="submit"
        className="font-display active:translate-y-px hidden min-h-12 items-center justify-center bg-charcoal px-8 text-sm text-lime uppercase transition hover:brightness-125 md:inline-flex"
      >
        See available times
      </button>

      {/*
        The shared-court rule, stated where someone is about to choose a sport, and
        written from the sports actually on offer -- so it never names a sport the venue
        has switched off.
      */}
      {sharedNote && (
        <p className="text-xs text-[var(--surface-muted)] md:col-span-3">{sharedNote}</p>
      )}
    </form>
  );
}

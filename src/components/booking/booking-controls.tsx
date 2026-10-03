import Link from "next/link";
import { addVenueDays, formatVenueDateLong } from "@/lib/domain/time";
import { cn } from "@/lib/utils/cn";

/**
 * Sport, date and duration pickers.
 *
 * All three are link groups rather than a JavaScript form: each option is a URL, the
 * server re-reads availability for it, and the browser's back button behaves the way a
 * customer expects. Nothing here needs a client bundle.
 */
export function BookingControls({
  sports,
  durations,
  selected,
  horizonDays,
  today,
}: {
  sports: Array<{ slug: string; name: string }>;
  durations: number[];
  selected: { sport: string; date: string; duration: number };
  horizonDays: number;
  today: string;
}) {
  const href = (overrides: Partial<typeof selected>) => {
    const next = { ...selected, ...overrides };
    return `/book?sport=${next.sport}&date=${next.date}&duration=${next.duration}`;
  };

  // A rolling week of dates, with arrows to page through up to the booking horizon.
  const windowStart = selected.date;
  const dates = Array.from({ length: 7 }, (_, offset) => addVenueDays(windowStart, offset));
  const previousWindow = addVenueDays(windowStart, -7);
  const lastBookable = addVenueDays(today, horizonDays);

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="text-eyebrow font-display mb-3 uppercase">Sport</legend>
        <div className="flex flex-wrap gap-2">
          {sports.map((sport) => {
            const active = sport.slug === selected.sport;
            return (
              <Link
                key={sport.slug}
                href={href({ sport: sport.slug })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "font-display flex min-h-12 items-center border px-5 text-sm uppercase transition-colors",
                  active
                    ? "border-[var(--surface-accent)] bg-[var(--surface-accent)] text-[var(--surface-accent-fg)]"
                    : "border-[var(--surface-line)] hover:border-[var(--surface-accent)]",
                )}
              >
                {sport.name}
              </Link>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <div className="mb-3 flex items-center justify-between gap-4">
          <legend className="text-eyebrow font-display uppercase">Date</legend>
          <div className="flex gap-2">
            <NavArrow
              href={href({ date: previousWindow })}
              disabled={previousWindow < today}
              label="Earlier dates"
            >
              ←
            </NavArrow>
            <NavArrow
              href={href({ date: addVenueDays(windowStart, 7) })}
              disabled={addVenueDays(windowStart, 7) > lastBookable}
              label="Later dates"
            >
              →
            </NavArrow>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {dates.map((date) => {
            const active = date === selected.date;
            const beyondHorizon = date > lastBookable;
            const past = date < today;
            const dateObject = new Date(`${date}T12:00:00Z`);
            const weekday = new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Karachi",
              weekday: "short",
            }).format(dateObject);
            const dayOfMonth = new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Karachi",
              day: "numeric",
            }).format(dateObject);

            if (past || beyondHorizon) {
              return (
                <span
                  key={date}
                  aria-label={`${formatVenueDateLong(dateObject)} — ${past ? "in the past" : "not open for booking yet"}`}
                  className="flex min-h-16 flex-col items-center justify-center border border-[var(--surface-line)] opacity-40"
                >
                  <span className="text-[10px] uppercase">{weekday}</span>
                  <span className="font-display text-lg" data-numeric="">
                    {dayOfMonth}
                  </span>
                </span>
              );
            }

            return (
              <Link
                key={date}
                href={href({ date })}
                aria-current={active ? "true" : undefined}
                aria-label={formatVenueDateLong(dateObject)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center border transition-colors",
                  active
                    ? "border-[var(--surface-accent)] bg-[var(--surface-accent)] text-[var(--surface-accent-fg)]"
                    : "border-[var(--surface-line)] hover:border-[var(--surface-accent)]",
                )}
              >
                <span className="text-[10px] uppercase">
                  {date === today ? "Tonight" : weekday}
                </span>
                <span className="font-display text-lg" data-numeric="">
                  {dayOfMonth}
                </span>
              </Link>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-eyebrow font-display mb-3 uppercase">How long?</legend>
        <div className="flex flex-wrap gap-2">
          {durations.map((duration) => {
            const active = duration === selected.duration;
            return (
              <Link
                key={duration}
                href={href({ duration })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "font-display flex min-h-12 items-center border px-5 text-sm uppercase transition-colors",
                  active
                    ? "border-[var(--surface-accent)] bg-[var(--surface-accent)] text-[var(--surface-accent-fg)]"
                    : "border-[var(--surface-line)] hover:border-[var(--surface-accent)]",
                )}
                data-numeric=""
              >
                {duration >= 60 ? `${duration / 60} hr${duration > 60 ? "s" : ""}` : `${duration} min`}
              </Link>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function NavArrow({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={`${label} (not available)`}
        className="grid size-10 place-items-center border border-[var(--surface-line)] opacity-35"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid size-10 place-items-center border border-[var(--surface-line)] transition-colors hover:border-[var(--surface-accent)]"
    >
      {children}
    </Link>
  );
}

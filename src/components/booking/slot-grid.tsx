import Link from "next/link";
import { explainSlotReason, groupSlotsByPartOfNight, type Slot } from "@/lib/domain/availability";
import { cn } from "@/lib/utils/cn";

/**
 * The slot grid.
 *
 * Slots are links, not buttons, so the whole picker works with JavaScript disabled and
 * every choice is a shareable URL. Unavailable slots are rendered as disabled text with
 * the reason in their accessible name -- they are not removed, because seeing that 8pm is
 * gone is useful information, and they are not left focusable-but-inert.
 */
export function SlotGrid({
  slots,
  baseHref,
  selectedLocal,
  sportChangeBufferMinutes,
}: {
  slots: Slot[];
  /** Query string carrying sport/date/duration; the slot appends `start`. */
  baseHref: string;
  selectedLocal?: string;
  sportChangeBufferMinutes?: number;
}) {
  const groups = groupSlotsByPartOfNight(slots);
  const hasPending = slots.some((slot) => slot.reason === "pending_approval");

  return (
    <div className="space-y-10">
      {hasPending && (
        <p className="flex items-start gap-2 border-l-2 border-pending pl-3 text-xs text-[var(--surface-muted)]">
          <span aria-hidden="true" className="mt-0.5 inline-block size-3 shrink-0 border border-pending bg-pending/20" />
          <span>
            Times marked <span className="text-pending">Pending</span> have been requested by
            someone else but not confirmed yet. They may come free — worth checking back.
          </span>
        </p>
      )}
      {groups.map((group) => (
        <section key={group.label}>
          <h3 className="text-eyebrow font-display mb-4 text-[var(--surface-muted)] uppercase">
            {group.label}
          </h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {group.slots.map((slot) => {
              const selected = slot.startsAtLocal === selectedLocal;

              if (!slot.available) {
                const reason = explainSlotReason(slot.reason!, { sportChangeBufferMinutes });
                // A slot somebody has REQUESTED is not the same as one that is booked: it
                // may still come free if the venue declines. It gets its own treatment —
                // amber rather than grey, and not struck through — so a customer can see
                // the difference at a glance and know it is worth checking back.
                const isPending = slot.reason === "pending_approval";

                return (
                  <li key={slot.startsAtLocal}>
                    <span
                      className={cn(
                        "flex min-h-14 flex-col items-center justify-center border px-2 text-center",
                        isPending
                          ? "border-pending/60 bg-pending/10 text-pending"
                          : "border-[var(--surface-line)] opacity-55",
                      )}
                      // The reason is part of the name, so a screen reader hears
                      // "8:00 pm, requested — awaiting confirmation" rather than just a
                      // dimmed time.
                      aria-label={`${slot.label} — ${reason}`}
                    >
                      <span
                        className={cn(
                          "font-display text-sm",
                          isPending ? "" : "line-through",
                        )}
                        data-numeric=""
                      >
                        {slot.label}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 text-[10px]",
                          isPending ? "text-pending/90" : "text-[var(--surface-muted)]",
                        )}
                      >
                        {isPending ? "Pending" : reason}
                      </span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={slot.startsAtLocal}>
                  <Link
                    href={`${baseHref}&start=${slot.startsAtLocal}`}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex min-h-14 items-center justify-center border px-2 text-center transition-colors",
                      "font-display text-base",
                      selected
                        ? "border-[var(--surface-accent)] bg-[var(--surface-accent)] text-[var(--surface-accent-fg)]"
                        : "border-[var(--surface-line)] hover:border-[var(--surface-accent)] hover:text-[var(--surface-accent)]",
                    )}
                    data-numeric=""
                  >
                    {slot.label}
                    {selected && <span className="sr-only"> (selected)</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

import { cn } from "@/lib/utils/cn";

/**
 * The wordmark.
 *
 * Set in type rather than an SVG logo, because no vector logo has been supplied. The
 * brand name comes from settings (`MadHaus`, as both official profiles render it), so
 * swapping in the real logo later is a single component change, and correcting the
 * spelling is a CMS edit.
 */
export function Wordmark({
  brandName,
  className,
  size = "md",
}: {
  brandName: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-lg",
    md: "text-2xl sm:text-3xl",
    lg: "text-display",
  } as const;

  return (
    <span
      className={cn(
        "font-display leading-none font-extrabold tracking-tight uppercase",
        sizes[size],
        className,
      )}
      style={{ fontStretch: "78%" }}
    >
      {brandName}
      {/* The full stop is the mark's only flourish, and it carries the accent colour. */}
      <span aria-hidden="true" className="text-[var(--surface-accent)]">
        .
      </span>
    </span>
  );
}

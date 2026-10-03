import { PLATFORM_LABELS, SocialIcon, type SocialPlatform } from "./social-icons";
import type { SiteSettings } from "@/lib/content/types";
import { cn } from "@/lib/utils/cn";

/**
 * The venue's social profiles.
 *
 * One component for every place these appear, so "which profiles exist" is decided once.
 * A profile the venue has not supplied simply does not render — there is no dead link to
 * a platform they are not on.
 *
 * Variants differ only in presentation:
 *   - `icons`    icon-only, for the footer, where space is tight
 *   - `buttons`  icon and label in a bordered control, for the gallery page
 *   - `inline`   icon and label on one line, for a prose context
 *
 * Icon-only links still carry a visible-to-screen-reader name, and their hit area is 44px
 * square — a glyph is 20px, which is not a target.
 */

const ORDER: SocialPlatform[] = ["instagram", "facebook", "tiktok"];

function profiles(settings: SiteSettings): Array<{ platform: SocialPlatform; href: string }> {
  return ORDER.map((platform) => ({ platform, href: settings.social[platform] })).filter(
    (entry): entry is { platform: SocialPlatform; href: string } => Boolean(entry.href),
  );
}

export function SocialLinks({
  settings,
  variant = "icons",
  className,
}: {
  settings: SiteSettings;
  variant?: "icons" | "buttons" | "inline";
  className?: string;
}) {
  const links = profiles(settings);
  if (links.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap items-center", variant === "icons" ? "gap-1" : "gap-3", className)}>
      {links.map(({ platform, href }) => {
        const label = PLATFORM_LABELS[platform];

        if (variant === "icons") {
          return (
            <li key={platform}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                // 44px square. The glyph inside is 20px; the rest is thumb.
                className="grid size-11 place-items-center text-[var(--surface-muted)] transition-colors hover:text-[var(--surface-accent)]"
              >
                <SocialIcon platform={platform} className="size-5" />
                {/* The link's accessible name. Not hover-dependent. */}
                <span className="sr-only">{label} — opens in a new tab</span>
              </a>
            </li>
          );
        }

        if (variant === "buttons") {
          return (
            <li key={platform}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-display inline-flex min-h-12 items-center gap-2.5 border-2 border-[var(--surface-fg)] px-5 text-sm uppercase transition hover:bg-[var(--surface-fg)] hover:text-[var(--surface-bg)]"
              >
                <SocialIcon platform={platform} className="size-[18px]" />
                {label}
                <span className="sr-only"> — opens in a new tab</span>
              </a>
            </li>
          );
        }

        return (
          <li key={platform}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center gap-2 text-sm transition-colors hover:text-[var(--surface-accent)]"
            >
              <SocialIcon platform={platform} className="size-[18px]" />
              <span className="underline decoration-[var(--surface-accent)] decoration-2 underline-offset-4">
                {label}
              </span>
              <span className="sr-only"> — opens in a new tab</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Mobile bottom action bar.
 *
 * Three things someone on a phone outside the venue actually wants: book, menu,
 * directions.
 *
 * Two details that stop it being a nuisance:
 *   - it hides itself on pages with their own primary action at the bottom (the booking
 *     flow, checkout, forms), so it can never sit on top of a submit button or a consent
 *     control;
 *   - the layout reserves its height with real padding rather than floating over the end
 *     of the page, so the footer is still reachable.
 */

const HIDE_ON = ["/book", "/booking", "/admin", "/studio", "/account", "/contact"];

export function MobileActionBar({ mapsUrl }: { mapsUrl: string | null }) {
  const pathname = usePathname();

  if (HIDE_ON.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  const actions = [
    { href: "/book", label: "Book", icon: "◉" },
    { href: "/menu", label: "Menu", icon: "☰" },
    mapsUrl
      ? { href: mapsUrl, label: "Directions", icon: "➤", external: true }
      : { href: "/contact", label: "Contact", icon: "✉" },
  ];

  return (
    <nav
      aria-label="Quick actions"
      data-surface="dark"
      data-print-hide=""
      className="surface fixed inset-x-0 bottom-0 z-40 border-t border-charcoal-line lg:hidden"
      // Clears the home indicator on phones with a gesture bar.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-3">
        {actions.map((action) => (
          <li key={action.label}>
            {"external" in action && action.external ? (
              <a
                href={action.href}
                target="_blank"
                rel="noreferrer noopener"
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs"
              >
                <span aria-hidden="true" className="text-base text-lime">
                  {action.icon}
                </span>
                {action.label}
              </a>
            ) : (
              <Link
                href={action.href}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs"
              >
                <span aria-hidden="true" className="text-base text-lime">
                  {action.icon}
                </span>
                {action.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Spacer that reserves the bar's height in normal flow.
 *
 * Without it the bar would cover the last of the footer, which is where the policy links
 * live.
 */
export function MobileActionBarSpacer() {
  return (
    <div
      aria-hidden="true"
      className="lg:hidden"
      style={{ height: "calc(3.5rem + env(safe-area-inset-bottom))" }}
    />
  );
}

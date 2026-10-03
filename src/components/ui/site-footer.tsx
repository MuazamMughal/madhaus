import Link from "next/link";
import { SocialLinks } from "./social-links";
import { Wordmark } from "./wordmark";
import type { SiteSettings } from "@/lib/content/types";

/**
 * Footer.
 *
 * Contact rows render only when the venue has supplied the detail. An unconfirmed phone
 * number is left out entirely rather than shown as a placeholder someone might try to ring.
 */
export function SiteFooter({ settings }: { settings: SiteSettings }) {
  const columns = [
    {
      heading: "Arena",
      links: [
        { label: "Overview", href: "/arena" },
        { label: "Padel", href: "/arena/padel" },
        { label: "Cricket", href: "/arena/cricket" },
        { label: "Book a court", href: "/book" },
      ],
    },
    {
      heading: "Café",
      links: [
        { label: "The café", href: "/cafe" },
        { label: "Menu", href: "/menu" },
        { label: "Offers", href: "/offers" },
      ],
    },
    {
      heading: "Venue",
      links: [
        { label: "About", href: "/about" },
        { label: "Events", href: "/events" },
        { label: "Gallery", href: "/gallery" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Cancellations", href: "/cancellation-policy" },
      ],
    },
  ];

  return (
    <footer data-surface="dark" data-print-hide="" className="surface border-t border-charcoal-line">
      <div className="shell py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Link href="/" aria-label={`${settings.brandName} — home`}>
              <Wordmark brandName={settings.brandName} size="lg" />
            </Link>
            {settings.tagline && (
              <p className="text-lead mt-4 max-w-sm text-grey-300">{settings.tagline}</p>
            )}
            <p className="text-eyebrow font-display mt-8 text-grey-400 uppercase">
              {settings.city}, Pakistan
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <h2 className="text-eyebrow font-display mb-4 text-grey-400 uppercase">
                  {column.heading}
                </h2>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-ivory transition-colors hover:text-lime"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* Contact block: only what has been confirmed. */}
        {(settings.phone || settings.email || settings.addressLines) && (
          <div className="mt-14 grid gap-6 border-t border-charcoal-line pt-10 sm:grid-cols-3">
            {settings.addressLines && (
              <div>
                <h2 className="text-eyebrow font-display mb-2 text-grey-400 uppercase">Address</h2>
                <address className="text-sm text-ivory not-italic">
                  {settings.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              </div>
            )}
            {settings.phone && (
              <div>
                <h2 className="text-eyebrow font-display mb-2 text-grey-400 uppercase">Phone</h2>
                <a href={`tel:${settings.phone}`} className="text-sm text-ivory hover:text-lime">
                  {settings.phone}
                </a>
              </div>
            )}
            {settings.email && (
              <div>
                <h2 className="text-eyebrow font-display mb-2 text-grey-400 uppercase">Email</h2>
                <a href={`mailto:${settings.email}`} className="text-sm text-ivory hover:text-lime">
                  {settings.email}
                </a>
              </div>
            )}
          </div>
        )}

        <div className="mt-14 flex flex-col gap-8 border-t border-charcoal-line pt-10 sm:flex-row sm:items-end sm:justify-between">
          {/* The closing statement. The venue's own line, doing the work. */}
          <p
            className="font-display max-w-xl text-3xl leading-[0.95] uppercase sm:text-4xl"
            style={{ fontStretch: "82%" }}
          >
            Play hard.
            <br />
            <span className="text-lime">Hang out longer.</span>
          </p>

          <div className="flex flex-col gap-4 sm:items-end">
            {/* Icon-only here: the footer is tight, and the marks are unmistakable.
                Each still carries a screen-reader name and a 44px target. */}
            <SocialLinks settings={settings} variant="icons" className="-mr-2 sm:justify-end" />
            <p className="text-xs text-grey-400">
              © {new Date().getFullYear()} {settings.brandName}. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

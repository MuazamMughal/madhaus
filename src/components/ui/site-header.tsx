"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ButtonLink } from "./button";
import { Wordmark } from "./wordmark";
import { cn } from "@/lib/utils/cn";

/**
 * Site header.
 *
 * Sticky, but it only grows its background once the page has scrolled, so the hero is
 * not permanently boxed in. The mobile panel is a real dialog: focus is trapped, Escape
 * closes it, and the page behind it does not scroll.
 */

export function SiteHeader({
  brandName,
  nav,
}: {
  brandName: string;
  /** From the CMS, already resolved. Never empty — the caller falls back. */
  nav: ReadonlyArray<{ label: string; href: string }>;
}) {
  const [scrolled, setScrolled] = useState(false);
  // The menu records WHICH page it was opened on. Navigating changes the pathname, so the
  // menu reads as closed without an effect having to reset it -- derived state rather
  // than a cascading render.
  const [openedOnPath, setOpenedOnPath] = useState<string | null>(null);
  const pathname = usePathname();
  const menuOpen = openedOnPath === pathname;

  const setMenuOpen = useCallback(
    (next: boolean | ((previous: boolean) => boolean)) => {
      setOpenedOnPath((current) => {
        const isOpen = current === pathname;
        const shouldOpen = typeof next === "function" ? next(isOpen) : next;
        return shouldOpen ? pathname : null;
      });
    },
    [pathname],
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;

      // Keep Tab inside the panel while it is open.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // Move focus into the panel so a keyboard user is not left behind it.
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, setMenuOpen]);

  return (
    <header
      data-surface="dark"
      data-print-hide=""
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        scrolled ? "border-b border-charcoal-line bg-charcoal/92 backdrop-blur-md" : "bg-transparent",
      )}
    >
      <div className="shell flex h-18 items-center justify-between gap-6 sm:h-20">
        <Link href="/" className="shrink-0" aria-label={`${brandName} — home`}>
          <Wordmark brandName={brandName} />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 lg:flex">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "font-display text-sm uppercase transition-colors",
                  // Current page is marked by an underline as well as colour, so the
                  // state is not carried by hue alone.
                  active
                    ? "text-lime underline decoration-2 underline-offset-8"
                    : "text-ivory hover:text-lime",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <ButtonLink href="/book" size="sm" className="hidden sm:inline-flex">
            Book a court
          </ButtonLink>

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="text-ivory -mr-2 grid size-12 place-items-center lg:hidden"
          >
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            <span aria-hidden="true" className="relative block h-3.5 w-6">
              <span
                className={cn(
                  "absolute left-0 block h-0.5 w-full bg-current transition-transform duration-300",
                  menuOpen ? "top-1.5 rotate-45" : "top-0",
                )}
              />
              <span
                className={cn(
                  "absolute left-0 block h-0.5 w-full bg-current transition-transform duration-300",
                  menuOpen ? "top-1.5 -rotate-45" : "top-3",
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="mobile-nav"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          data-surface="dark"
          className="surface border-t border-charcoal-line lg:hidden"
        >
          <nav aria-label="Main" className="shell flex flex-col py-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-display flex min-h-14 items-center border-b border-charcoal-line text-xl uppercase last:border-b-0"
              >
                {item.label}
              </Link>
            ))}
            <ButtonLink href="/book" size="lg" className="mt-4 w-full">
              Book a court
            </ButtonLink>
          </nav>
        </div>
      )}
    </header>
  );
}

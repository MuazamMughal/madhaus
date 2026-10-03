"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/** Dashboard navigation. Scrolls horizontally on a phone rather than wrapping into a wall. */
export function AdminNav({ links }: { links: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="border-b border-charcoal-line">
      <ul className="shell flex gap-1 overflow-x-auto">
        {links.map((link) => {
          const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "font-display flex min-h-12 items-center border-b-2 px-4 text-xs whitespace-nowrap uppercase transition-colors",
                  active
                    ? "border-lime text-lime"
                    : "border-transparent text-grey-300 hover:text-ivory",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

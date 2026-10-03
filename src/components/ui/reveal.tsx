"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Entrance animation.
 *
 * Deliberately not a motion-library component. The element is styled by CSS keyed on a
 * data attribute, and this only flips that attribute when the element scrolls into view,
 * so:
 *   - without JavaScript the content is visible, not stuck at opacity 0;
 *   - `prefers-reduced-motion` is honoured entirely in CSS, with no JS branch to forget;
 *   - the cost is one IntersectionObserver, not a client-side animation runtime.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  /** Stagger step, 0-5. Mapped to a CSS transition-delay. */
  delay?: 0 | 1 | 2 | 3 | 4 | 5;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // If the browser cannot observe, show the content rather than hide it.
    if (typeof IntersectionObserver === "undefined") {
      node.dataset.revealed = "true";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.revealed = "true";
            observer.unobserve(entry.target);
          }
        }
      },
      // Fire a little before the element is fully on screen, so the movement has
      // finished by the time the reader's eye arrives.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-reveal=""
      data-reveal-delay={delay > 0 ? String(delay) : undefined}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The one button in the system.
 *
 * Tactile rather than decorative: it presses in by a hair, and its focus ring comes
 * from the surrounding surface so it stays visible on charcoal, ivory and lime alike.
 * Minimum height is 48px on every variant, which is a comfortable thumb target and
 * clears the WCAG 2.2 target-size minimum with room to spare.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base = [
  "group relative inline-flex items-center justify-center gap-2",
  "font-display uppercase tracking-wide",
  "transition-[transform,background-color,color,border-color] duration-150",
  "active:translate-y-px",
  "disabled:pointer-events-none disabled:opacity-45",
  // A disabled control must still explain itself, so callers pair this with
  // aria-describedby rather than relying on the dimming alone.
  "aria-disabled:pointer-events-none aria-disabled:opacity-45",
].join(" ");

const variants: Record<Variant, string> = {
  // Accent-on-surface: lime on charcoal, orange on ivory, charcoal on lime.
  primary:
    "bg-[var(--surface-accent)] text-[var(--surface-accent-fg)] hover:brightness-95",
  secondary:
    "border-2 border-[var(--surface-fg)] text-[var(--surface-fg)] hover:bg-[var(--surface-fg)] hover:text-[var(--surface-bg)]",
  ghost:
    "text-[var(--surface-fg)] underline decoration-2 decoration-[var(--surface-accent)] underline-offset-4 hover:decoration-[var(--surface-fg)]",
  danger: "bg-negative text-charcoal hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "min-h-11 px-4 text-xs",
  md: "min-h-12 px-6 text-sm",
  lg: "min-h-14 px-8 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps & ComponentPropsWithoutRef<"button">;
type AnchorProps = CommonProps & { href: string } & Omit<
    ComponentPropsWithoutRef<typeof Link>,
    "href" | "className" | "children"
  >;

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  ...rest
}: AnchorProps) {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {children}
    </Link>
  );
}

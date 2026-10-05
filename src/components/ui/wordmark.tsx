import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * The wordmark.
 *
 * The supplied MadHaus logo, shared across the public site and staff dashboard.
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
    sm: "w-28 sm:w-32",
    md: "w-36 sm:w-44",
    lg: "w-56 sm:w-72",
  } as const;

  return (
    <span className={cn("inline-flex shrink-0 items-center", sizes[size], className)}>
      <Image
        src="/images/brand/madhaus-logo.png"
        alt={brandName}
        width={1979}
        height={538}
        sizes={size === "lg" ? "(min-width: 640px) 288px, 224px" : size === "sm" ? "(min-width: 640px) 128px, 112px" : "(min-width: 640px) 176px, 144px"}
        className="h-auto w-full object-contain"
      />
    </span>
  );
}

import type { SVGProps } from "react";

/**
 * Social platform glyphs.
 *
 * Drawn as inline SVG rather than loaded from an icon package or a CDN: three small paths
 * cost nothing, add no dependency, and cannot fail to load. They take `currentColor`, so
 * they inherit the surrounding surface and the existing hover transitions without
 * knowing which section they are in.
 *
 * Every one is `aria-hidden` — the link around them already carries the accessible name,
 * and a screen reader announcing "Instagram graphic, Instagram link" is worse than
 * silence.
 *
 * These are the platforms' own marks, used to link to MadHaus's own profiles, which is
 * what they are for. They are not recoloured arbitrarily or combined with other logos.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "viewBox">;

const base = {
  viewBox: "0 0 24 24",
  fill: "currentColor",
  "aria-hidden": true,
  focusable: "false",
} as const;

/** Instagram: rounded square, lens, flash dot. Drawn as outline + solid dot. */
export function InstagramIcon({ className, ...rest }: IconProps) {
  return (
    <svg {...base} className={className} {...rest}>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.81 3.81 0 0 1-1.38-.9 3.81 3.81 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38A5.9 5.9 0 0 0 .63 4.14c-.3.76-.5 1.64-.56 2.91C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13a5.9 5.9 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.9 5.9 0 0 0 2.13-1.38 5.9 5.9 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.9 5.9 0 0 0-1.38-2.13A5.9 5.9 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0Z" />
      <path d="M12 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32Zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
      <circle cx="18.41" cy="5.59" r="1.44" />
    </svg>
  );
}

/** Facebook: the f, in its circle. */
export function FacebookIcon({ className, ...rest }: IconProps) {
  return (
    <svg {...base} className={className} {...rest}>
      <path d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.93-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12Z" />
    </svg>
  );
}

/** TikTok: the note. */
export function TikTokIcon({ className, ...rest }: IconProps) {
  return (
    <svg {...base} className={className} {...rest}>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .78-5.06V9.69a5.68 5.68 0 0 0-.78-.05 5.68 5.68 0 1 0 5.68 5.68V8.9a7.34 7.34 0 0 0 4.29 1.37V7.18a4.29 4.29 0 0 1-3.23-1.36Z" />
    </svg>
  );
}

export type SocialPlatform = "instagram" | "facebook" | "tiktok";

const ICONS = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
} as const;

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export function SocialIcon({
  platform,
  className,
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  const Icon = ICONS[platform];
  return <Icon className={className} />;
}

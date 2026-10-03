import NextImage from "next/image";
import type { ImageRef } from "@/lib/content/types";
import { cn } from "@/lib/utils/cn";

/**
 * An image panel, or an honest stand-in for one.
 *
 * No photography of the venue has been supplied, and using stock imagery would
 * misrepresent what the place looks like. So when an image is missing this renders a
 * designed graphic -- court markings drawn in the brand palette -- that reads as an
 * intentional graphic panel rather than a broken image, and carries a small label
 * naming the shot that belongs here.
 *
 * Swapping in real photography is a CMS action: set the image, the fallback disappears.
 */

type Aspect = "square" | "portrait" | "landscape" | "wide" | "fill";

const aspectClasses: Record<Aspect, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
  wide: "aspect-[16/9]",
  fill: "absolute inset-0",
};

export interface MediaPanelProps {
  image: ImageRef | null;
  /** What this image is for. Shown on the placeholder so the gap is actionable. */
  placeholderLabel: string;
  aspect?: Aspect;
  /** Which abstract court graphic to draw. Keeps repeated panels from matching. */
  motif?: "padel" | "pitch" | "cafe" | "crowd";
  className?: string;
  /** Pass for above-the-fold images so they are not lazy-loaded. */
  priority?: boolean;
  sizes?: string;
  /** Adds the grain overlay. On by default for real photography. */
  grain?: boolean;
  /**
   * Suppress the "image needed" note. Used for full-bleed background panels, where the
   * note would sit on top of the headline. The requirement is still listed in
   * docs/ASSETS.md, so nothing is lost by hiding it here.
   */
  hidePlaceholderLabel?: boolean;
}

export function MediaPanel({
  image,
  placeholderLabel,
  aspect = "landscape",
  motif = "padel",
  className,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 50vw",
  grain = true,
  hidePlaceholderLabel = false,
}: MediaPanelProps) {
  const frame = cn(
    "relative overflow-hidden bg-charcoal-raised",
    aspect !== "fill" && aspectClasses[aspect],
    aspect === "fill" && aspectClasses.fill,
    grain && "grain",
    className,
  );

  if (!image) {
    return (
      <div className={frame} data-placeholder="">
        <CourtMotif motif={motif} />
        {!hidePlaceholderLabel && (
        <p
          className="text-eyebrow font-display absolute bottom-3 left-3 max-w-[85%] bg-charcoal/85 px-2 py-1 text-grey-300 uppercase"
          // Decorative to AT: the label is a note to whoever fills the CMS, not
          // information the visitor needs read aloud.
          aria-hidden="true"
        >
          Image needed — {placeholderLabel}
        </p>
        )}
      </div>
    );
  }

  return (
    <div className={frame}>
      <NextImage
        src={image.url}
        alt={image.alt}
        fill
        priority={priority}
        sizes={sizes}
        placeholder={image.lqip ? "blur" : "empty"}
        blurDataURL={image.lqip}
        className="object-cover"
        style={
          image.hotspot
            ? { objectPosition: `${image.hotspot.x * 100}% ${image.hotspot.y * 100}%` }
            : undefined
        }
      />
    </div>
  );
}

/**
 * Abstract court graphics. Drawn as inline SVG so they cost no request, scale cleanly and
 * carry no risk of looking like a photograph of somewhere else.
 */
function CourtMotif({ motif }: { motif: NonNullable<MediaPanelProps["motif"]> }) {
  const stroke = "var(--color-charcoal-line)";
  const accent = "var(--color-lime)";

  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="400" height="300" fill="var(--color-charcoal-raised)" />

      {motif === "padel" && (
        <g fill="none" strokeWidth="1.5">
          {/* Padel court: service boxes and the net line across the middle. */}
          <rect x="70" y="50" width="260" height="200" stroke={stroke} />
          <line x1="70" y1="150" x2="330" y2="150" stroke={accent} strokeWidth="2" />
          <line x1="70" y1="105" x2="330" y2="105" stroke={stroke} />
          <line x1="70" y1="195" x2="330" y2="195" stroke={stroke} />
          <line x1="200" y1="50" x2="200" y2="105" stroke={stroke} />
          <line x1="200" y1="195" x2="200" y2="250" stroke={stroke} />
          <circle cx="200" cy="150" r="3" fill={accent} stroke="none" />
        </g>
      )}

      {motif === "pitch" && (
        <g fill="none" strokeWidth="1.5">
          {/* Shared multipurpose court: centre circle plus a cricket crease. */}
          <rect x="50" y="40" width="300" height="220" stroke={stroke} />
          <circle cx="200" cy="150" r="42" stroke={stroke} />
          <line x1="200" y1="40" x2="200" y2="260" stroke={stroke} />
          <line x1="150" y1="118" x2="150" y2="182" stroke={accent} strokeWidth="2" />
          <line x1="250" y1="118" x2="250" y2="182" stroke={accent} strokeWidth="2" />
          <rect x="50" y="110" width="26" height="80" stroke={stroke} />
          <rect x="324" y="110" width="26" height="80" stroke={stroke} />
        </g>
      )}

      {motif === "cafe" && (
        <g fill="none" strokeWidth="1.5">
          {/* A cup, in outline. Warmer accent, since the café runs on orange. */}
          <circle cx="200" cy="150" r="58" stroke={stroke} />
          <circle cx="200" cy="150" r="40" stroke="var(--color-orange)" strokeWidth="2" />
          <path d="M258 128h22a16 16 0 0 1 0 32h-22" stroke={stroke} />
          <line x1="150" y1="222" x2="250" y2="222" stroke={stroke} />
        </g>
      )}

      {motif === "crowd" && (
        <g fill="none" strokeWidth="1.5">
          {/* Floodlight arcs over a horizon: the look of the place at night. */}
          <line x1="0" y1="230" x2="400" y2="230" stroke={stroke} />
          <path d="M60 230V90m0 0-34 34m34-34 34 34" stroke={stroke} />
          <path d="M340 230V90m0 0-34 34m34-34 34 34" stroke={stroke} />
          <path d="M60 90q140-70 280 0" stroke={accent} strokeWidth="2" strokeDasharray="6 8" />
        </g>
      )}

      {/* Faint hatching, so the panel has texture rather than sitting flat. */}
      <pattern id={`hatch-${motif}`} width="8" height="8" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="8" stroke={stroke} strokeWidth="1" opacity="0.5" />
      </pattern>
      <rect width="400" height="300" fill={`url(#hatch-${motif})`} opacity="0.35" />
    </svg>
  );
}

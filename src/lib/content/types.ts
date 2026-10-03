/**
 * Content shapes shared by the Sanity reader and the sample fallback.
 *
 * Every field the venue has not confirmed is optional or nullable, so a page can render
 * honestly with a gap instead of inventing a plausible-looking fact.
 */

export interface ImageRef {
  url: string;
  /** Required by the schema. An image with no alt text fails validation in the Studio. */
  alt: string;
  width?: number;
  height?: number;
  /** Sanity hotspot, used to keep the subject in frame when cropping. */
  hotspot?: { x: number; y: number };
  /** Tiny blurred placeholder, so large panels do not pop in. */
  lqip?: string;
}

export interface SiteSettings {
  /** Verified as "MadHaus" from both official profiles. Editable in one place. */
  brandName: string;
  /** Short tagline. The venue's own words on Facebook: "Your new hangout spot". */
  tagline: string | null;
  city: string;
  /** null until the venue supplies it. The Visit section degrades rather than guesses. */
  addressLines: string[] | null;
  mapsUrl: string | null;
  coordinates: { lat: number; lng: number } | null;
  phone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  /** Rendered from the operating_hours table, not hardcoded. */
  hoursNote: string | null;
  social: { instagram?: string; facebook?: string; tiktok?: string };
  /**
   * True when the content on screen is the shipped sample rather than the venue's own.
   * Drives the visible development banner and blocks indexing.
   */
  isSampleContent: boolean;
}

export interface HeroContent {
  headline: string;
  /** Line breaks are an editorial decision, so the headline is authored as lines. */
  headlineLines?: string[];
  subhead: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  locationLabel: string;
  image: ImageRef | null;
  /** Optional, muted, poster-backed. Absent by default: no invented footage. */
  video: { src: string; poster: string } | null;
}

export interface SportSummary {
  slug: string;
  name: string;
  /** One line that sells it. */
  blurb: string;
  /** Explains the shared court where it applies. */
  courtNote: string | null;
  image: ImageRef | null;
  /** Shown only when a rate is configured; never a placeholder price. */
  fromPriceLabel: string | null;
}

export interface MenuItemContent {
  slug: string;
  name: string;
  description: string | null;
  category: string;
  priceLabel: string | null;
  /** Only shown when the venue has confirmed them. */
  dietaryTags: string[];
  allergenNote: string | null;
  image: ImageRef | null;
  isFeatured: boolean;
  isAvailable: boolean;
}

export interface EventContent {
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  summary: string;
  image: ImageRef | null;
  registrationMode: "none" | "inquiry" | "register";
  eligibility: string | null;
}

export interface OfferContent {
  slug: string;
  title: string;
  summary: string;
  /** Marketing copy. The server enforces the real discount, never this text. */
  termsNote: string | null;
  validTo: string | null;
  image: ImageRef | null;
}

export interface Testimonial {
  quote: string;
  attribution: string;
  /** Only approved, attributable reviews are published. */
  source: string | null;
}

export interface GalleryItem {
  image: ImageRef;
  caption: string | null;
  category: "arena" | "cafe" | "community";
}

export interface Amenity {
  label: string;
  description: string | null;
}

export interface FaqItem {
  question: string;
  answer: string;
}

import { isSanityConfigured, serverEnv } from "@/lib/env";
import { SAMPLE_FAQS, SAMPLE_HERO, SAMPLE_SITE_SETTINGS } from "./sample";
import type { FaqItem, HeroContent, ImageRef, SiteSettings } from "./types";

/**
 * Content resolver.
 *
 * Every page reads content through here. When a Sanity project is configured the CMS is
 * the source; when it is not, the labelled sample content is used and `isSampleContent`
 * stays true so the banner shows and the page is excluded from indexing.
 *
 * The point of the indirection is that the application is fully runnable with no CMS
 * credentials, and that the difference between "real content" and "placeholder" is a
 * single flag rather than something a reader has to guess at.
 */

export async function getSiteSettings(): Promise<SiteSettings> {
  if (!isSanityConfigured()) return SAMPLE_SITE_SETTINGS;

  const { sanityFetch } = await import("@/lib/sanity/client");
  const doc = await sanityFetch<Partial<SiteSettings> | null>({
    query: `*[_type == "siteSettings"][0]{
      brandName, tagline, city, addressLines, mapsUrl, coordinates, phone,
      whatsappPhone, email, hoursNote, social
    }`,
    tags: ["siteSettings"],
  });

  if (!doc) return SAMPLE_SITE_SETTINGS;

  // Merge over the sample rather than trusting the document to be complete: a half-filled
  // settings document should not blank the header.
  return {
    ...SAMPLE_SITE_SETTINGS,
    ...stripNullish(doc),
    social: { ...SAMPLE_SITE_SETTINGS.social, ...(doc.social ?? {}) },
    // Real CMS content, so the banner comes down and the page becomes indexable.
    isSampleContent: false,
  };
}

export async function getHero(): Promise<HeroContent> {
  if (!isSanityConfigured()) return SAMPLE_HERO;

  const { sanityFetch, imageRef, resolveLink } = await import("@/lib/sanity/client");
  const doc = await sanityFetch<Record<string, unknown> | null>({
    query: `*[_type == "homepage"][0].hero{
      headline, headlineLines, subhead, locationLabel,
      primaryCta, secondaryCta,
      image{..., asset->{url, metadata{lqip, dimensions}}},
      video
    }`,
    tags: ["homepage"],
  });

  if (!doc) return SAMPLE_HERO;

  /*
   * The CTAs are Sanity `link` objects carrying `path` or `url`, not `href`. They are
   * resolved explicitly below and must NOT be spread in raw — doing that is what produced
   * `href: undefined` and took the homepage down.
   *
   * `omit` rather than destructuring, so the discarded keys do not become unused bindings.
   */
  const rest = omit(doc, ["primaryCta", "secondaryCta"]);

  return {
    ...SAMPLE_HERO,
    ...stripNullish(rest as Partial<HeroContent>),
    primaryCta: resolveLink(doc.primaryCta) ?? SAMPLE_HERO.primaryCta,
    secondaryCta: resolveLink(doc.secondaryCta) ?? SAMPLE_HERO.secondaryCta,
    image: imageRef(doc.image),
  };
}

export function siteUrl(path = "/"): string {
  return new URL(path, serverEnv().NEXT_PUBLIC_SITE_URL).toString();
}

/** Drop named keys from an object. */
function omit<T extends object>(input: T, keys: readonly string[]): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !keys.includes(key)),
  ) as Partial<T>;
}

/** Drop null/undefined keys so a spread cannot overwrite a good default with a blank. */
function stripNullish<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

// --- Editorial content, merged onto operational data -----------------------------------

/**
 * The CMS half of a sport, keyed by slug.
 *
 * Which sports exist, what they cost and when they can be booked all come from Postgres.
 * This is only the words and pictures. A sport the venue has switched off is never shown
 * even if a CMS document for it exists, because the database decides what is on offer.
 */
export interface SportEditorial {
  blurb: string | null;
  image: ImageRef | null;
}

export async function getSportEditorial(): Promise<Map<string, SportEditorial>> {
  if (!isSanityConfigured()) return new Map();

  const { sanityFetch, imageRef } = await import("@/lib/sanity/client");
  const docs = await sanityFetch<Array<Record<string, unknown>>>({
    query: `*[_type == "sportPage" && defined(slug.current)]{
      "slug": slug.current,
      blurb,
      heroImage{..., asset->{url, metadata{lqip, dimensions}}}
    }`,
    tags: ["sportPage"],
  });

  return new Map(
    (docs ?? []).map((doc) => [
      String(doc.slug),
      {
        blurb: typeof doc.blurb === "string" && doc.blurb.trim() !== "" ? doc.blurb : null,
        image: imageRef(doc.heroImage),
      },
    ]),
  );
}

/**
 * The CMS half of a menu item, keyed by slug.
 *
 * Deliberately excludes price and availability: those come from the database, because the
 * price on the website has to be the price the till charges.
 *
 * Dietary tags and allergen notes come from here because they are the kitchen's words, but
 * they are only ever shown when the kitchen has actually written them — an empty array
 * means "we have not said", not "none".
 */
export interface MenuEditorial {
  description: string | null;
  dietaryTags: string[];
  allergenNote: string | null;
  isFeatured: boolean;
  image: ImageRef | null;
}

export async function getMenuEditorial(): Promise<Map<string, MenuEditorial>> {
  if (!isSanityConfigured()) return new Map();

  const { sanityFetch, imageRef } = await import("@/lib/sanity/client");
  const docs = await sanityFetch<Array<Record<string, unknown>>>({
    query: `*[_type == "menuItem" && defined(slug.current)]{
      "slug": slug.current,
      description, dietaryTags, allergenNote, isFeatured,
      image{..., asset->{url, metadata{lqip, dimensions}}}
    }`,
    tags: ["menuItem"],
  });

  return new Map(
    (docs ?? []).map((doc) => [
      String(doc.slug),
      {
        description:
          typeof doc.description === "string" && doc.description.trim() !== ""
            ? doc.description
            : null,
        dietaryTags: Array.isArray(doc.dietaryTags) ? (doc.dietaryTags as string[]) : [],
        allergenNote:
          typeof doc.allergenNote === "string" && doc.allergenNote.trim() !== ""
            ? doc.allergenNote
            : null,
        isFeatured: doc.isFeatured === true,
        image: imageRef(doc.image),
      },
    ]),
  );
}

/** FAQs, in the order the venue set. */
export async function getFaqs(): Promise<FaqItem[]> {
  if (!isSanityConfigured()) return SAMPLE_FAQS;

  const { sanityFetch } = await import("@/lib/sanity/client");
  const docs = await sanityFetch<Array<{ question?: string; answer?: string }>>({
    query: `*[_type == "faq" && defined(question) && defined(answer)]
              | order(coalesce(sortOrder, 999) asc){question, answer}`,
    tags: ["faq"],
  });

  const usable = (docs ?? []).filter(
    (doc): doc is FaqItem => Boolean(doc.question?.trim() && doc.answer?.trim()),
  );
  return usable.length > 0 ? usable : SAMPLE_FAQS;
}

/**
 * The main menu and footer links.
 *
 * Falls back to the built-in navigation when the CMS has none, so the header can never
 * render empty. Links that are incomplete in the CMS are dropped rather than rendered
 * with an undefined href.
 */
export interface SiteNavigation {
  primary: Array<{ label: string; href: string }>;
  closingStatement: string | null;
}

export const FALLBACK_NAVIGATION: SiteNavigation = {
  primary: [
    { label: "Arena", href: "/arena" },
    { label: "Café", href: "/cafe" },
    { label: "Events", href: "/events" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  closingStatement: null,
};

export async function getNavigation(): Promise<SiteNavigation> {
  if (!isSanityConfigured()) return FALLBACK_NAVIGATION;

  const { sanityFetch, resolveLinks } = await import("@/lib/sanity/client");
  const doc = await sanityFetch<{ primary?: unknown; closingStatement?: string } | null>({
    query: `*[_type == "navigation"][0]{primary, closingStatement}`,
    tags: ["navigation"],
  });

  const primary = resolveLinks(doc?.primary);

  return {
    primary: primary.length > 0 ? primary : FALLBACK_NAVIGATION.primary,
    closingStatement: doc?.closingStatement?.trim() || null,
  };
}

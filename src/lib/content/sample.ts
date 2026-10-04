import type {
  Amenity,
  EventContent,
  FaqItem,
  HeroContent,
  MenuItemContent,
  OfferContent,
  SiteSettings,
  SportSummary,
  Testimonial,
} from "./types";

/**
 * Sample content, used when Sanity is not configured.
 *
 * Ground rules, applied without exception:
 *   - Anything the venue has publicly stated itself is reproduced as-is and marked
 *     verified in docs/VERIFIED-FACTS.md.
 *   - Anything not confirmed is either omitted (null) or written so it cannot be
 *     mistaken for a fact -- no invented address, phone number, price, review, award,
 *     amenity or menu claim.
 *   - `isSampleContent` is true, which shows a banner on every page and blocks indexing.
 *     A production deployment with a real Sanity dataset flips it to false.
 *
 * Prices are deliberately absent everywhere in this file. Court rates come from the
 * `pricing_rules` table and menu prices from `menu_items`, so a price on screen is
 * always a real configured number, never sample text.
 */

export const SAMPLE_SITE_SETTINGS: SiteSettings = {
  // Verified: both the Instagram profile name and the Facebook page name read "MadHaus".
  brandName: "MadHaus",
  // Verified: the venue's own Facebook bio.
  tagline: "Your new hangout spot",
  // Verified: both bios.
  city: "Sahiwal",
  // NOT verified. The venue has published a city, never a street address.
  addressLines: null,
  mapsUrl: null,
  coordinates: null,
  phone: null,
  whatsappPhone: null,
  email: null,
  // Left null: the Visit section renders hours from operating_hours so the site and the
  // booking engine can never disagree about when the venue is open.
  hoursNote: null,
  social: {
    instagram: "https://www.instagram.com/themadhauspk/",
    facebook: "https://www.facebook.com/themadhauspk/",
    tiktok: "https://www.tiktok.com/@themadhauspk",
  },
  isSampleContent: true,
};

export const SAMPLE_HERO: HeroContent = {
  headline: "Your next great night starts here",
  // Authored as lines so the break lands where it should, not where the box ends.
  headlineLines: ["Your next", "great night", "starts here"],
  subhead:
    "Sahiwal's first padel court, a cricket court under the lights, and a kitchen that keeps going until three in the morning.",
  primaryCta: { label: "Book your game", href: "/book" },
  secondaryCta: { label: "Explore the café", href: "/cafe" },
  // Verified: the venue is in Sahiwal.
  locationLabel: "Sahiwal, Pakistan",
  image: null,
  // No footage has been supplied. The hero renders its designed fallback rather than
  // embedding stock video that misrepresents the venue.
  video: null,
};

/**
 * Sport copy. The court-sharing note on football and cricket is the operational truth
 * the booking engine enforces, so it is stated plainly rather than buried.
 */
export const SAMPLE_SPORTS: Record<string, Omit<SportSummary, "fromPriceLabel">> = {
  padel: {
    slug: "padel",
    name: "Padel",
    blurb:
      "Glass walls, floodlights, and rallies that go on far longer than they should. Easy to start, impossible to leave.",
    courtNote: "One dedicated court, yours for the whole session.",
    image: null,
  },
  cricket: {
    slug: "cricket",
    name: "Cricket",
    blurb:
      "Tape ball under the lights. Bring a side, settle an argument, stay for the food.",
    courtNote:
      "Played on the multipurpose court, which is shared with futsal — booking one takes the other off the board.",
    image: null,
  },
  football: {
    slug: "football",
    name: "Futsal",
    blurb: "Small-sided, fast, and floodlit. Best played late.",
    courtNote:
      "Played on the multipurpose court, which is shared with cricket — booking one takes the other off the board.",
    image: null,
  },
};

/**
 * Café items. Names and descriptions here are SAMPLE text to exercise the menu UI --
 * categories, search, availability, featured items. No prices, no dietary claims and no
 * allergen statements, because getting any of those wrong is a real-world harm.
 */
export const SAMPLE_MENU_ITEMS: MenuItemContent[] = [
  {
    slug: "sample-house-burger",
    name: "SAMPLE — House Burger",
    description: "Placeholder item. Replace with the venue's real menu before launch.",
    category: "Mains",
    priceLabel: null,
    dietaryTags: [],
    allergenNote: null,
    image: null,
    isFeatured: true,
    isAvailable: true,
  },
  {
    slug: "sample-loaded-fries",
    name: "SAMPLE — Loaded Fries",
    description: "Placeholder item. Replace with the venue's real menu before launch.",
    category: "Sides",
    priceLabel: null,
    dietaryTags: [],
    allergenNote: null,
    image: null,
    isFeatured: true,
    isAvailable: true,
  },
  {
    slug: "sample-cold-coffee",
    name: "SAMPLE — Cold Coffee",
    description: "Placeholder item. Replace with the venue's real menu before launch.",
    category: "Coffee",
    priceLabel: null,
    dietaryTags: [],
    allergenNote: null,
    image: null,
    isFeatured: true,
    isAvailable: true,
  },
  {
    slug: "sample-club-sandwich",
    name: "SAMPLE — Club Sandwich",
    description: "Placeholder item. Replace with the venue's real menu before launch.",
    category: "Mains",
    priceLabel: null,
    dietaryTags: [],
    allergenNote: null,
    image: null,
    isFeatured: false,
    isAvailable: true,
  },
  {
    slug: "sample-wings",
    name: "SAMPLE — Wings",
    description: "Placeholder item. Replace with the venue's real menu before launch.",
    category: "Starters",
    priceLabel: null,
    dietaryTags: [],
    allergenNote: null,
    image: null,
    isFeatured: false,
    isAvailable: false,
  },
  {
    slug: "sample-espresso",
    name: "SAMPLE — Espresso",
    description: "Placeholder item. Replace with the venue's real menu before launch.",
    category: "Coffee",
    priceLabel: null,
    dietaryTags: [],
    allergenNote: null,
    image: null,
    isFeatured: false,
    isAvailable: true,
  },
];

/**
 * Amenities. Only what both public bios state: padel, a cricket court, and a food court
 * with coffee. Nothing about parking, changing rooms, equipment hire, seating capacity
 * or air conditioning, none of which has been confirmed.
 */
export const SAMPLE_AMENITIES: Amenity[] = [
  { label: "Padel court", description: "Sahiwal's first, per the venue's own listing." },
  { label: "Cricket court", description: "Multipurpose, floodlit." },
  { label: "Food court & coffee", description: "Dine-in and takeaway." },
  { label: "Open late", description: "Until 3am." },
];

/** Empty by design. The section hides itself; it does not fill itself. */
export const SAMPLE_EVENTS: EventContent[] = [];
export const SAMPLE_OFFERS: OfferContent[] = [];

/**
 * Empty, and it must stay empty until real reviews are supplied with permission to
 * publish them. Inventing a testimonial is fabricating a person's words, and review
 * structured data is never emitted for content that is not genuine.
 */
export const SAMPLE_TESTIMONIALS: Testimonial[] = [];

export const SAMPLE_FAQS: FaqItem[] = [
  {
    question: "Do futsal and cricket use the same court?",
    answer:
      "Yes. There is one multipurpose court, so a futsal booking and a cricket booking cannot overlap — booking either one takes that time off the board for both. Padel has its own dedicated court and is unaffected.",
  },
  {
    question: "How late can we play?",
    answer: "The venue runs from 5pm until 3am, and sessions that run past midnight are normal here.",
  },
  {
    question: "Can I book without an account?",
    answer:
      "Yes. A name and a phone number is all a booking needs. Creating an account just means your bookings are in one place next time.",
  },
  {
    question: "What happens if I need to cancel?",
    answer:
      "The cancellation window is set by the venue and is shown on your booking before you confirm it, and again on the confirmation page. Inside that window you can cancel yourself; after it, give the venue a call.",
  },
];

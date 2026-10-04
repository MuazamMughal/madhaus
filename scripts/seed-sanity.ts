import { createClient } from "next-sanity";
import "./load-env";
import {
  SAMPLE_FAQS,
  SAMPLE_HERO,
  SAMPLE_SITE_SETTINGS,
} from "@/lib/content/sample";

/**
 * Populate a new Sanity dataset with the content shipped as local fallbacks.
 *
 * This is intentionally additive: createIfNotExists keeps an existing editor's content
 * intact. Run with --apply to write; without it the script only lists the documents.
 */
type SanityDocument = { _id: string; _type: string; [key: string]: unknown };

const slug = (current: string) => ({ _type: "slug", current });

function textBlock(text: string, key: string) {
  return {
    _type: "block",
    _key: key,
    style: "normal",
    markDefs: [],
    children: [{ _type: "span", _key: `${key}-span`, text, marks: [] }],
  };
}

const siteSettings: SanityDocument = {
  _id: "siteSettings",
  _type: "siteSettings",
  brandName: SAMPLE_SITE_SETTINGS.brandName,
  tagline: SAMPLE_SITE_SETTINGS.tagline,
  city: SAMPLE_SITE_SETTINGS.city,
  social: SAMPLE_SITE_SETTINGS.social,
};

const designSettings: SanityDocument = {
  _id: "designSettings",
  _type: "designSettings",
  note: "The shipped palette is a design direction, not the venue's confirmed brand colours.",
  charcoal: "#101010",
  ivory: "#F4F0E8",
  lime: "#D5FF3F",
  orange: "#FF6534",
};

const navigation: SanityDocument = {
  _id: "navigation",
  _type: "navigation",
  primary: [
    { _key: "arena", _type: "link", label: "The arena", kind: "internal", path: "/arena" },
    { _key: "cafe", _type: "link", label: "Café", kind: "internal", path: "/cafe" },
    { _key: "menu", _type: "link", label: "Menu", kind: "internal", path: "/menu" },
    { _key: "about", _type: "link", label: "About", kind: "internal", path: "/about" },
    { _key: "contact", _type: "link", label: "Contact", kind: "internal", path: "/contact" },
  ],
  footerColumns: [
    {
      _key: "visit",
      _type: "column",
      heading: "Visit",
      links: [
        { _key: "arena", _type: "link", label: "The arena", kind: "internal", path: "/arena" },
        { _key: "cafe", _type: "link", label: "The café", kind: "internal", path: "/cafe" },
        { _key: "contact", _type: "link", label: "Contact", kind: "internal", path: "/contact" },
      ],
    },
    {
      _key: "information",
      _type: "column",
      heading: "Information",
      links: [
        { _key: "privacy", _type: "link", label: "Privacy", kind: "internal", path: "/privacy" },
        { _key: "terms", _type: "link", label: "Terms", kind: "internal", path: "/terms" },
        {
          _key: "cancellation",
          _type: "link",
          label: "Cancellation policy",
          kind: "internal",
          path: "/cancellation-policy",
        },
      ],
    },
  ],
  closingStatement: "Play hard. Hang out longer.",
};

const homepage: SanityDocument = {
  _id: "homepage",
  _type: "homepage",
  hero: {
    headlineLines: SAMPLE_HERO.headlineLines,
    subhead: SAMPLE_HERO.subhead,
    locationLabel: SAMPLE_HERO.locationLabel,
    primaryCta: { _type: "link", label: SAMPLE_HERO.primaryCta.label, kind: "internal", path: SAMPLE_HERO.primaryCta.href },
    secondaryCta: { _type: "link", label: SAMPLE_HERO.secondaryCta.label, kind: "internal", path: SAMPLE_HERO.secondaryCta.href },
  },
  marqueeItems: ["Padel", "Cricket", "Coffee till 3am", "Floodlit", "Sahiwal"],
  cafeIntro: {
    heading: "Stay for the food.",
    body: "The kitchen and the coffee run as late as the courts do. Come off the court and straight to a table, or just come for the food.",
  },
  venueIntro: {
    heading: "Built for late nights.",
    body: "A padel court, a cricket court under the lights, and somewhere worth sitting afterwards.",
    amenities: [
      { _key: "padel", label: "Padel court", description: "Sahiwal's first, per the venue's own listing." },
      { _key: "cricket", label: "Cricket court", description: "Multipurpose, floodlit." },
      { _key: "food", label: "Food court & coffee", description: "Dine-in and takeaway." },
      { _key: "late", label: "Open late", description: "Until 3am." },
    ],
  },
};

const sportPages: SanityDocument[] = Object.values({
  padel: {
    _id: "sportPage-padel",
    _type: "sportPage",
    title: "Padel",
    slug: slug("padel"),
    blurb: "Glass walls, floodlights, and rallies that go on far longer than they should. Easy to start, impossible to leave.",
  },
  cricket: {
    _id: "sportPage-cricket",
    _type: "sportPage",
    title: "Cricket",
    slug: slug("cricket"),
    blurb: "Tape ball under the lights. Bring a side, settle an argument, stay for the food.",
  },
  football: {
    _id: "sportPage-football",
    _type: "sportPage",
    title: "Futsal",
    slug: slug("football"),
    blurb: "Small-sided, fast, and floodlit. Best played late.",
  },
});

const docs: SanityDocument[] = [
  siteSettings,
  designSettings,
  navigation,
  homepage,
  ...sportPages,
  {
    _id: "cafePage",
    _type: "cafePage",
    heading: "Stay for the food.",
    lead: "The kitchen and the coffee run as late as the courts do. Come off the court and straight to a table, or just come for the food.",
  },
  {
    _id: "aboutPage",
    _type: "aboutPage",
    heading: "Your new hangout spot",
    lead: "Padel, cricket, food and coffee in Sahiwal, open late.",
    body: [textBlock("MadHaus brings sport and the café together in one late-night destination. The venue's published profiles describe padel, cricket, food, and coffee.", "about-1")],
  },
  {
    _id: "contactPage",
    _type: "contactPage",
    heading: "Come by or get in touch",
    lead: "Find MadHaus in Sahiwal. For court availability, send a booking request and the team will follow up.",
  },
  ...SAMPLE_FAQS.map((item, index) => ({
    _id: `faq-${index + 1}`,
    _type: "faq",
    question: item.question,
    answer: item.answer,
    topic: index === 0 ? "courts" : "booking",
    sortOrder: index,
  })),
];

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
  const token = process.env.SANITY_API_WRITE_TOKEN;
  const apply = process.argv.includes("--apply");
  const futsalOnly = process.argv.includes("--futsal");
  const selectedDocs = futsalOnly
    ? docs.filter((doc) => doc._id === "sportPage-football")
    : docs;

  if (!projectId) throw new Error("Set NEXT_PUBLIC_SANITY_PROJECT_ID in .env.local.");
  if (apply && !token) throw new Error("Set SANITY_API_WRITE_TOKEN to a Sanity token with dataset write access.");

  console.log(`${apply ? "Seeding" : "Dry run:"} ${selectedDocs.length} Sanity documents into ${projectId}/${dataset}`);
  console.log(futsalOnly
    ? "Futsal's title and blurb will be updated; existing images and other fields are preserved."
    : "Existing documents are preserved. This seeder does not delete or overwrite content.");
  if (!apply) {
    for (const doc of selectedDocs) console.log(`  ${doc._type}: ${doc._id}`);
    console.log(`Run npm run sanity:seed -- --apply${futsalOnly ? " --futsal" : ""} to apply.`);
    return;
  }

  const client = createClient({
    projectId,
    dataset,
    apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION ?? "2026-10-01",
    useCdn: false,
    token,
  });

  const transaction = client.transaction();
  for (const doc of selectedDocs) {
    transaction.createIfNotExists(doc);
    if (futsalOnly) {
      transaction.patch(doc._id, { set: { title: doc.title, blurb: doc.blurb } });
    }
  }
  const result = await transaction.commit();
  console.log(`Seed complete. Sanity transaction id: ${result.transactionId}`);
  console.log("Empty event, offer, gallery and testimonial lists were left empty; no real records or media were supplied.");
}

main().catch((error: unknown) => {
  console.error("Sanity seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

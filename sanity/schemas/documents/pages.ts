import { defineField, defineType } from "sanity";

/**
 * Page documents.
 *
 * Each page is a fixed shape, not a free-form builder. Editors change words and pictures;
 * they cannot rearrange a page into something the design does not account for. That is a
 * deliberate trade: a narrower Studio in exchange for a site that cannot be broken from
 * inside it.
 */

export const homepage = defineType({
  name: "homepage",
  title: "Homepage",
  type: "document",
  groups: [
    { name: "hero", title: "Hero", default: true },
    { name: "sections", title: "Sections" },
    { name: "seo", title: "Search & sharing" },
  ],
  fields: [
    defineField({
      name: "hero",
      title: "Hero",
      type: "object",
      group: "hero",
      fields: [
        defineField({
          name: "headlineLines",
          title: "Headline, one line per row",
          type: "array",
          of: [{ type: "string" }],
          description:
            "Where the line breaks fall is a design decision — write each line separately. The last line takes the accent colour.",
          validation: (rule) => rule.required().min(1).max(4),
        }),
        defineField({
          name: "subhead",
          title: "Supporting line",
          type: "text",
          rows: 2,
          validation: (rule) => rule.required().max(220),
        }),
        defineField({
          name: "locationLabel",
          title: "Location label",
          type: "string",
          initialValue: "Sahiwal, Pakistan",
        }),
        defineField({
          name: "image",
          title: "Background image",
          type: "brandImage",
          description: "Full-bleed behind the headline. Landscape, at least 2000px wide.",
        }),
        defineField({
          name: "video",
          title: "Background video",
          type: "object",
          description:
            "Optional. Muted and looping. A poster image is required so people who prefer reduced motion still see something.",
          fields: [
            { name: "url", type: "url", title: "Video URL (MP4)" },
            {
              name: "poster",
              type: "brandImage",
              title: "Poster frame",
              validation: (rule) =>
                rule.custom((value, context) => {
                  const parent = context.parent as { url?: string } | undefined;
                  if (parent?.url && !value) {
                    return "A poster image is required whenever a video is set.";
                  }
                  return true;
                }),
            },
          ],
        }),
        defineField({
          name: "primaryCta",
          title: "Primary button",
          type: "link",
        }),
        defineField({
          name: "secondaryCta",
          title: "Secondary button",
          type: "link",
        }),
      ],
    }),

    defineField({
      name: "marqueeItems",
      title: "Marquee words",
      type: "array",
      of: [{ type: "string" }],
      group: "sections",
      description: "Short words that scroll across the band between sections.",
      validation: (rule) => rule.max(8),
    }),

    defineField({
      name: "cafeIntro",
      title: "Café section",
      type: "object",
      group: "sections",
      fields: [
        { name: "heading", type: "string", validation: (rule) => rule.max(60) },
        { name: "body", type: "text", rows: 3, validation: (rule) => rule.max(400) },
        { name: "images", type: "array", of: [{ type: "brandImage" }], validation: (rule) => rule.max(2) },
      ],
    }),

    defineField({
      name: "venueIntro",
      title: "Venue section",
      type: "object",
      group: "sections",
      fields: [
        { name: "heading", type: "string", validation: (rule) => rule.max(60) },
        { name: "body", type: "text", rows: 3, validation: (rule) => rule.max(400) },
        {
          name: "amenities",
          title: "Amenities",
          type: "array",
          description:
            "Only list what the venue actually has. Anything here reads as a statement of fact.",
          of: [
            {
              type: "object",
              name: "amenity",
              fields: [
                { name: "label", type: "string", validation: (rule) => rule.required().max(40) },
                { name: "description", type: "string", validation: (rule) => rule.max(90) },
              ],
              preview: { select: { title: "label", subtitle: "description" } },
            },
          ],
        },
        { name: "images", type: "array", of: [{ type: "brandImage" }], validation: (rule) => rule.max(2) },
      ],
    }),

    defineField({ name: "seo", type: "seo", group: "seo" }),
  ],
  preview: { prepare: () => ({ title: "Homepage" }) },
});

/**
 * Sport page.
 *
 * The slug must match a sport in the operational database. Editorial copy lives here;
 * which sports exist, what they cost, and when they can be booked all come from the
 * database, so the CMS cannot advertise a sport the venue has switched off.
 */
export const sportPage = defineType({
  name: "sportPage",
  title: "Sport page",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "seo", title: "Search & sharing" },
  ],
  fields: [
    defineField({
      name: "title",
      type: "string",
      group: "content",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      type: "slug",
      group: "content",
      description:
        "Must match the sport's slug in the booking system (padel, cricket, football).",
      options: { source: "title", maxLength: 40 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "blurb",
      title: "One-line pitch",
      type: "text",
      rows: 2,
      group: "content",
      validation: (rule) => rule.required().max(220),
    }),
    defineField({
      name: "body",
      title: "Longer description",
      type: "richText",
      group: "content",
    }),
    defineField({
      name: "heroImage",
      type: "brandImage",
      group: "content",
    }),
    defineField({
      name: "gallery",
      type: "array",
      of: [{ type: "brandImage" }],
      group: "content",
      validation: (rule) => rule.max(8),
    }),
    defineField({ name: "seo", type: "seo", group: "seo" }),
  ],
  preview: { select: { title: "title", subtitle: "slug.current", media: "heroImage" } },
});

export const cafePage = defineType({
  name: "cafePage",
  title: "Café page",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "seo", title: "Search & sharing" },
  ],
  fields: [
    defineField({ name: "heading", type: "string", group: "content", validation: (rule) => rule.required() }),
    defineField({ name: "lead", type: "text", rows: 3, group: "content", validation: (rule) => rule.max(300) }),
    defineField({ name: "body", type: "richText", group: "content" }),
    defineField({ name: "images", type: "array", of: [{ type: "brandImage" }], group: "content", validation: (rule) => rule.max(6) }),
    defineField({ name: "seo", type: "seo", group: "seo" }),
  ],
  preview: { prepare: () => ({ title: "Café page" }) },
});

export const aboutPage = defineType({
  name: "aboutPage",
  title: "About page",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "seo", title: "Search & sharing" },
  ],
  fields: [
    defineField({ name: "heading", type: "string", group: "content", validation: (rule) => rule.required() }),
    defineField({ name: "lead", type: "text", rows: 3, group: "content" }),
    defineField({ name: "body", type: "richText", group: "content" }),
    defineField({ name: "images", type: "array", of: [{ type: "brandImage" }], group: "content", validation: (rule) => rule.max(4) }),
    defineField({ name: "seo", type: "seo", group: "seo" }),
  ],
  preview: { prepare: () => ({ title: "About page" }) },
});

export const contactPage = defineType({
  name: "contactPage",
  title: "Contact page",
  type: "document",
  fields: [
    defineField({ name: "heading", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "lead", type: "text", rows: 3 }),
    defineField({
      name: "responseTimeNote",
      title: "Response time note",
      type: "string",
      description: "Only fill this in if the venue can actually meet it.",
      validation: (rule) => rule.max(120),
    }),
    defineField({ name: "seo", type: "seo" }),
  ],
  preview: { prepare: () => ({ title: "Contact page" }) },
});

/**
 * Policy page. Draft content carries a visible "needs review" banner on the site until
 * `reviewedByBusiness` is ticked, because an unreviewed legal document that looks
 * finished is worse than one that admits it is a draft.
 */
export const policyPage = defineType({
  name: "policyPage",
  title: "Policy page",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (rule) => rule.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 60 },
      description: "privacy, terms or cancellation-policy",
      validation: (rule) => rule.required(),
    }),
    defineField({ name: "body", type: "richText", validation: (rule) => rule.required() }),
    defineField({
      name: "reviewedByBusiness",
      title: "Reviewed and approved by the business",
      type: "boolean",
      initialValue: false,
      description:
        "Leave off until someone at the venue has actually read and approved this. While it is off, the page shows a 'draft, needs review' notice.",
    }),
    defineField({ name: "updatedAt", title: "Last updated", type: "date" }),
    defineField({ name: "seo", type: "seo" }),
  ],
  preview: {
    select: { title: "title", reviewed: "reviewedByBusiness" },
    prepare: ({ title, reviewed }) => ({
      title,
      subtitle: reviewed ? "Approved" : "DRAFT — needs business review",
    }),
  },
});

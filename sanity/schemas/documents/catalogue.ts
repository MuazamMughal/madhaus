import { defineField, defineType } from "sanity";

/**
 * Catalogue documents: menu, events, offers, gallery, testimonials, FAQs.
 *
 * The recurring theme is that Sanity owns presentation and the database owns anything
 * transactional. A menu item's picture and description live here; its price and whether
 * it is in stock live in Postgres, because the café charges from the database and a price
 * that only exists in the CMS would be a price nobody honours.
 */

export const menuCategory = defineType({
  name: "menuCategory",
  title: "Menu category",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (rule) => rule.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 40 },
      validation: (rule) => rule.required(),
    }),
    defineField({ name: "description", type: "string", validation: (rule) => rule.max(140) }),
    defineField({
      name: "sortOrder",
      type: "number",
      description: "Lower numbers come first.",
      initialValue: 0,
    }),
  ],
  orderings: [{ title: "Menu order", name: "sortOrder", by: [{ field: "sortOrder", direction: "asc" }] }],
  preview: { select: { title: "title", subtitle: "description" } },
});

export const menuItem = defineType({
  name: "menuItem",
  title: "Menu item",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "dietary", title: "Dietary & allergens" },
  ],
  fields: [
    defineField({ name: "title", type: "string", group: "content", validation: (rule) => rule.required() }),
    defineField({
      name: "slug",
      type: "slug",
      group: "content",
      description: "Must match the item's slug in the ordering system.",
      options: { source: "title", maxLength: 60 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "category",
      type: "reference",
      to: [{ type: "menuCategory" }],
      group: "content",
      validation: (rule) => rule.required(),
    }),
    defineField({ name: "description", type: "text", rows: 2, group: "content", validation: (rule) => rule.max(220) }),
    defineField({ name: "image", type: "brandImage", group: "content" }),
    defineField({
      name: "isFeatured",
      title: "Feature this item",
      type: "boolean",
      group: "content",
      initialValue: false,
      description: "Featured items appear on the homepage and the café page.",
    }),
    defineField({
      name: "priceNote",
      title: "Price note",
      type: "string",
      group: "content",
      readOnly: true,
      initialValue: "Prices are set in the ordering system, not here.",
      description:
        "The price shown on the site always comes from the database, so the menu and the till can never disagree.",
    }),

    defineField({
      name: "dietaryTags",
      title: "Dietary tags",
      type: "array",
      group: "dietary",
      of: [{ type: "string" }],
      options: {
        list: [
          { title: "Vegetarian", value: "Vegetarian" },
          { title: "Vegan", value: "Vegan" },
          { title: "Contains nuts", value: "Contains nuts" },
          { title: "Spicy", value: "Spicy" },
        ],
      },
      description:
        "Only tick these once the kitchen has confirmed them. A wrong tag can make someone ill.",
    }),
    defineField({
      name: "allergenNote",
      title: "Allergen note",
      type: "text",
      rows: 2,
      group: "dietary",
      description:
        "Written by kitchen staff. Leave blank rather than guessing — the site shows a 'ask us' note when this is empty.",
    }),
  ],
  preview: { select: { title: "title", subtitle: "category.title", media: "image" } },
});

export const event = defineType({
  name: "event",
  title: "Event",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "logistics", title: "Logistics" },
    { name: "seo", title: "Search & sharing" },
  ],
  fields: [
    defineField({ name: "title", type: "string", group: "content", validation: (rule) => rule.required() }),
    defineField({
      name: "slug",
      type: "slug",
      group: "content",
      description: "Must match the event's slug in the booking system, which holds its capacity.",
      options: { source: "title", maxLength: 60 },
      validation: (rule) => rule.required(),
    }),
    defineField({ name: "summary", type: "text", rows: 2, group: "content", validation: (rule) => rule.required().max(240) }),
    defineField({ name: "body", type: "richText", group: "content" }),
    defineField({ name: "image", type: "brandImage", group: "content" }),

    defineField({
      name: "startsAt",
      title: "Starts",
      type: "datetime",
      group: "logistics",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "endsAt",
      title: "Ends",
      type: "datetime",
      group: "logistics",
      validation: (rule) =>
        rule.required().custom((value, context) => {
          const start = (context.document as { startsAt?: string } | undefined)?.startsAt;
          if (!start || !value) return true;
          return new Date(value) > new Date(start) || "An event must end after it starts.";
        }),
    }),
    defineField({
      name: "eligibility",
      title: "Who it is for",
      type: "string",
      group: "logistics",
      description: "e.g. Open to all levels. Leave blank if there are no restrictions.",
      validation: (rule) => rule.max(140),
    }),
    defineField({
      name: "registrationInstructions",
      type: "text",
      rows: 3,
      group: "logistics",
      description:
        "How people sign up. Capacity and online registration are controlled in the booking system, not here.",
    }),
    defineField({
      name: "isPublished",
      title: "Published",
      type: "boolean",
      group: "logistics",
      initialValue: false,
      description: "Unpublished events are invisible on the site.",
    }),

    defineField({ name: "seo", type: "seo", group: "seo" }),
  ],
  orderings: [{ title: "Soonest first", name: "startsAt", by: [{ field: "startsAt", direction: "asc" }] }],
  preview: {
    select: { title: "title", startsAt: "startsAt", published: "isPublished", media: "image" },
    prepare: ({ title, startsAt, published, media }) => ({
      title,
      subtitle: `${published ? "" : "UNPUBLISHED — "}${startsAt ? new Date(startsAt).toLocaleDateString("en-GB") : "no date"}`,
      media,
    }),
  },
});

/**
 * Offer. Marketing copy only.
 *
 * The actual discount is a coupon row in the database, and the server enforces it there.
 * This document describes an offer; it cannot create one, which is why the discount
 * amount is not a field here.
 */
export const offer = defineType({
  name: "offer",
  title: "Offer",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (rule) => rule.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 60 },
      validation: (rule) => rule.required(),
    }),
    defineField({ name: "summary", type: "text", rows: 2, validation: (rule) => rule.required().max(240) }),
    defineField({
      name: "couponCode",
      title: "Coupon code",
      type: "string",
      description:
        "Must match a coupon in the booking system. The discount, limits and expiry all live there — this document only describes the offer.",
    }),
    defineField({ name: "termsNote", title: "Conditions", type: "text", rows: 2 }),
    defineField({ name: "image", type: "brandImage" }),
    defineField({
      name: "isPublished",
      type: "boolean",
      initialValue: false,
      description:
        "Publishing this does not create a discount. The offer only applies at checkout if a matching, active coupon exists in the booking system.",
    }),
  ],
  preview: { select: { title: "title", subtitle: "couponCode", media: "image" } },
});

export const galleryCollection = defineType({
  name: "galleryCollection",
  title: "Gallery collection",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (rule) => rule.required() }),
    defineField({
      name: "category",
      type: "string",
      options: {
        list: [
          { title: "Arena", value: "arena" },
          { title: "Café", value: "cafe" },
          { title: "Community", value: "community" },
        ],
        layout: "radio",
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "images",
      type: "array",
      of: [{ type: "brandImage" }],
      description: "Brand-owned photography only — images the venue has the right to publish.",
      validation: (rule) => rule.required().min(1).max(24),
    }),
  ],
  preview: { select: { title: "title", subtitle: "category", media: "images.0" } },
});

/**
 * Testimonial.
 *
 * `permissionGiven` is required to be true before anything is published, because
 * reproducing someone's words and name without their say-so is not ours to do. Review
 * structured data is never emitted from these.
 */
export const testimonial = defineType({
  name: "testimonial",
  title: "Testimonial",
  type: "document",
  fields: [
    defineField({ name: "quote", type: "text", rows: 3, validation: (rule) => rule.required().max(400) }),
    defineField({
      name: "attribution",
      title: "Who said it",
      type: "string",
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: "source",
      title: "Where it came from",
      type: "string",
      description: "e.g. Google review, in person, Instagram comment.",
    }),
    defineField({
      name: "permissionGiven",
      title: "They have agreed to this being published",
      type: "boolean",
      initialValue: false,
      validation: (rule) =>
        rule.custom((value) =>
          value === true
            ? true
            : "A testimonial cannot be published until the person has agreed to it.",
        ),
    }),
    defineField({
      name: "isApproved",
      title: "Approved for the site",
      type: "boolean",
      initialValue: false,
    }),
  ],
  preview: {
    select: { title: "attribution", subtitle: "quote", approved: "isApproved" },
    prepare: ({ title, subtitle, approved }) => ({
      title: `${approved ? "" : "NOT APPROVED — "}${title}`,
      subtitle,
    }),
  },
});

export const faq = defineType({
  name: "faq",
  title: "FAQ",
  type: "document",
  fields: [
    defineField({ name: "question", type: "string", validation: (rule) => rule.required().max(160) }),
    defineField({ name: "answer", type: "text", rows: 4, validation: (rule) => rule.required() }),
    defineField({
      name: "topic",
      type: "string",
      options: {
        list: [
          { title: "Booking", value: "booking" },
          { title: "The courts", value: "courts" },
          { title: "Café", value: "cafe" },
          { title: "Visiting", value: "visiting" },
        ],
      },
    }),
    defineField({ name: "sortOrder", type: "number", initialValue: 0 }),
  ],
  orderings: [{ title: "Display order", name: "sortOrder", by: [{ field: "sortOrder", direction: "asc" }] }],
  preview: { select: { title: "question", subtitle: "topic" } },
});

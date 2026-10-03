import { defineField, defineType } from "sanity";

/**
 * Singleton settings documents.
 *
 * These are the only place the brand's name, colours and contact details are authored.
 * They are singletons, enforced by the Studio structure (one fixed document id each), so
 * an editor cannot accidentally create a second set of site settings and wonder why half
 * the site disagrees with the other half.
 */

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site settings",
  type: "document",
  groups: [
    { name: "brand", title: "Brand", default: true },
    { name: "contact", title: "Contact & location" },
    { name: "social", title: "Social" },
  ],
  fields: [
    defineField({
      name: "brandName",
      title: "Brand name",
      type: "string",
      group: "brand",
      description:
        "How the venue's name is written everywhere on the site. Both official social profiles render it as 'MadHaus'.",
      initialValue: "MadHaus",
      validation: (rule) => rule.required().max(40),
    }),
    defineField({
      name: "tagline",
      title: "Tagline",
      type: "string",
      group: "brand",
      description: "A short line. The venue's own Facebook bio says: Your new hangout spot.",
      validation: (rule) => rule.max(80),
    }),
    defineField({
      name: "logo",
      title: "Logo",
      type: "brandImage",
      group: "brand",
      description:
        "Upload the vector or high-resolution logo. Until one is supplied the site sets the name in type.",
    }),

    defineField({
      name: "city",
      title: "City",
      type: "string",
      group: "contact",
      initialValue: "Sahiwal",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "addressLines",
      title: "Street address",
      type: "array",
      of: [{ type: "string" }],
      group: "contact",
      description:
        "One line per row. Leave empty until the real address is confirmed — the site shows an honest gap rather than a guess.",
    }),
    defineField({
      name: "coordinates",
      title: "Map location",
      type: "geopoint",
      group: "contact",
      description: "Used for the map pin and for local search results.",
    }),
    defineField({
      name: "mapsUrl",
      title: "Directions link",
      type: "url",
      group: "contact",
    }),
    defineField({
      name: "phone",
      title: "Phone",
      type: "string",
      group: "contact",
      description: "As you want it displayed, e.g. 0300 1234567.",
    }),
    defineField({
      name: "whatsappPhone",
      title: "WhatsApp number",
      type: "string",
      group: "contact",
      description:
        "Used for a click-to-chat link. This opens a draft for the customer to send — it is not automated messaging.",
    }),
    defineField({
      name: "email",
      title: "Email",
      type: "string",
      group: "contact",
      validation: (rule) => rule.email(),
    }),

    defineField({
      name: "social",
      title: "Social profiles",
      type: "object",
      group: "social",
      fields: [
        { name: "instagram", type: "url", title: "Instagram" },
        { name: "facebook", type: "url", title: "Facebook" },
        { name: "tiktok", type: "url", title: "TikTok" },
      ],
    }),
  ],
  preview: { prepare: () => ({ title: "Site settings" }) },
});

/**
 * Design settings.
 *
 * Mirrors the CSS custom properties in globals.css. The palette shipped with the site is
 * the brief's suggested direction, NOT sampled from brand assets, so it lives here to be
 * repointed at the real brand colours without touching a component.
 */
export const designSettings = defineType({
  name: "designSettings",
  title: "Design",
  type: "document",
  fields: [
    defineField({
      name: "note",
      title: "About these colours",
      type: "string",
      readOnly: true,
      initialValue:
        "The shipped palette is a design direction, not the venue's confirmed brand colours.",
    }),
    defineField({
      name: "charcoal",
      title: "Deep charcoal",
      type: "string",
      description: "The dark ground colour. Hex, e.g. #101010",
      initialValue: "#101010",
      validation: (rule) => rule.regex(/^#[0-9a-fA-F]{6}$/, { name: "hex colour" }),
    }),
    defineField({
      name: "ivory",
      title: "Warm ivory",
      type: "string",
      initialValue: "#F4F0E8",
      validation: (rule) => rule.regex(/^#[0-9a-fA-F]{6}$/, { name: "hex colour" }),
    }),
    defineField({
      name: "lime",
      title: "Electric lime",
      type: "string",
      description: "The arena accent.",
      initialValue: "#D5FF3F",
      validation: (rule) => rule.regex(/^#[0-9a-fA-F]{6}$/, { name: "hex colour" }),
    }),
    defineField({
      name: "orange",
      title: "Hot orange",
      type: "string",
      description: "The café accent.",
      initialValue: "#FF6534",
      validation: (rule) => rule.regex(/^#[0-9a-fA-F]{6}$/, { name: "hex colour" }),
    }),
  ],
  preview: { prepare: () => ({ title: "Design settings" }) },
});

export const navigation = defineType({
  name: "navigation",
  title: "Navigation & footer",
  type: "document",
  fields: [
    defineField({
      name: "primary",
      title: "Main menu",
      type: "array",
      of: [{ type: "link" }],
      description: "Five or six items at most — the header is not a site map.",
      validation: (rule) => rule.max(7).warning("More than seven items will crowd the header."),
    }),
    defineField({
      name: "footerColumns",
      title: "Footer columns",
      type: "array",
      of: [
        {
          type: "object",
          name: "column",
          fields: [
            { name: "heading", type: "string", validation: (rule) => rule.required() },
            { name: "links", type: "array", of: [{ type: "link" }] },
          ],
          preview: { select: { title: "heading" } },
        },
      ],
      validation: (rule) => rule.max(4),
    }),
    defineField({
      name: "closingStatement",
      title: "Closing statement",
      type: "string",
      description: "The large line at the bottom of every page.",
      initialValue: "Play hard. Hang out longer.",
      validation: (rule) => rule.max(60),
    }),
  ],
  preview: { prepare: () => ({ title: "Navigation & footer" }) },
});

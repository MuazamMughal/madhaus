import { defineField, defineType } from "sanity";

/**
 * Reusable objects.
 *
 * Kept deliberately few. The brief calls for constrained, useful controls rather than an
 * unrestricted page builder, so editors compose from a small set of well-defined pieces
 * and the design cannot be taken apart from the Studio.
 */

/**
 * Every image in the system goes through this.
 *
 * Alt text is REQUIRED, not optional-with-a-warning: an image published without it is an
 * accessibility failure that reaches real users, and the Studio is the only place it can
 * be caught.
 */
export const brandImage = defineType({
  name: "brandImage",
  title: "Image",
  type: "image",
  options: {
    // Lets editors choose the subject, so the same image crops sensibly in a square tile
    // and a wide banner without re-uploading.
    hotspot: true,
  },
  fields: [
    defineField({
      name: "alt",
      title: "Alt text",
      type: "string",
      description:
        "Describe what is in the picture for someone who cannot see it. If it is purely decorative, write 'Decorative'.",
      validation: (rule) =>
        rule.required().min(3).max(160).error("Alt text is required on every image."),
    }),
    defineField({
      name: "caption",
      title: "Caption",
      type: "string",
      description: "Optional. Shown under the image where the design allows for it.",
      validation: (rule) => rule.max(140),
    }),
  ],
  preview: {
    select: { media: "asset", title: "alt" },
  },
});

/** A link that is either internal or external, never both. */
export const link = defineType({
  name: "link",
  title: "Link",
  type: "object",
  fields: [
    defineField({
      name: "label",
      type: "string",
      validation: (rule) => rule.required().max(40),
    }),
    defineField({
      name: "kind",
      title: "Links to",
      type: "string",
      options: {
        list: [
          { title: "A page on this site", value: "internal" },
          { title: "Another website", value: "external" },
        ],
        layout: "radio",
      },
      initialValue: "internal",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "path",
      title: "Path",
      type: "string",
      description: "Starting with a slash, e.g. /arena/padel",
      hidden: ({ parent }) => parent?.kind !== "internal",
      validation: (rule) =>
        rule.custom((value, context) => {
          const parent = context.parent as { kind?: string } | undefined;
          if (parent?.kind !== "internal") return true;
          if (!value) return "Enter the path.";
          return value.startsWith("/") || "Paths must start with a slash.";
        }),
    }),
    defineField({
      name: "url",
      title: "URL",
      type: "url",
      hidden: ({ parent }) => parent?.kind !== "external",
      validation: (rule) =>
        rule.custom((value, context) => {
          const parent = context.parent as { kind?: string } | undefined;
          if (parent?.kind !== "external") return true;
          return value ? true : "Enter the full URL.";
        }),
    }),
  ],
  preview: { select: { title: "label", subtitle: "path" } },
});

/** SEO metadata. Shared by every page-like document. */
export const seo = defineType({
  name: "seo",
  title: "Search & sharing",
  type: "object",
  options: { collapsible: true, collapsed: true },
  fields: [
    defineField({
      name: "title",
      title: "Search title",
      type: "string",
      description: "Up to about 60 characters. Leave blank to use the page title.",
      validation: (rule) => rule.max(70).warning("Over 70 characters is likely to be cut off."),
    }),
    defineField({
      name: "description",
      title: "Search description",
      type: "text",
      rows: 3,
      description: "One or two sentences, up to about 155 characters.",
      validation: (rule) => rule.max(170).warning("Over 170 characters is likely to be cut off."),
    }),
    defineField({
      name: "image",
      title: "Sharing image",
      type: "brandImage",
      description: "Shown when the page is shared. Landscape, at least 1200x630.",
    }),
    defineField({
      name: "noIndex",
      title: "Hide from search engines",
      type: "boolean",
      initialValue: false,
    }),
  ],
});

/** Restrained rich text. No arbitrary embeds, no custom styling. */
export const richText = defineType({
  name: "richText",
  title: "Text",
  type: "array",
  of: [
    {
      type: "block",
      // Only the styles the design actually renders. Offering H1 here would let an editor
      // put a second page-level heading on a page and break its outline.
      styles: [
        { title: "Paragraph", value: "normal" },
        { title: "Heading", value: "h2" },
        { title: "Sub-heading", value: "h3" },
        { title: "Quote", value: "blockquote" },
      ],
      lists: [
        { title: "Bulleted", value: "bullet" },
        { title: "Numbered", value: "number" },
      ],
      marks: {
        decorators: [
          { title: "Bold", value: "strong" },
          { title: "Italic", value: "em" },
        ],
        annotations: [
          {
            name: "link",
            type: "object",
            title: "Link",
            fields: [
              { name: "href", type: "url", title: "URL", validation: (rule) => rule.required() },
              {
                name: "newTab",
                type: "boolean",
                title: "Open in a new tab",
                initialValue: false,
              },
            ],
          },
        ],
      },
    },
    { type: "brandImage" },
  ],
});

export const objectSchemas = [brandImage, link, seo, richText];

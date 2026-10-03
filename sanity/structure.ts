import type { StructureResolver } from "sanity/structure";
import { SINGLETON_TYPES } from "./schemas";

/**
 * Studio navigation.
 *
 * Organised the way the venue thinks -- the site, the arena, the café, what's on -- rather
 * than as a flat alphabetical list of document types. Singletons open straight into the
 * one document rather than showing a list with one row and a "create" button that would
 * make a second.
 */
export const structure: StructureResolver = (S) =>
  S.list()
    .title("MadHaus")
    .items([
      S.listItem()
        .title("Site")
        .child(
          S.list()
            .title("Site")
            .items([
              singleton(S, "siteSettings", "Settings"),
              singleton(S, "navigation", "Navigation & footer"),
              singleton(S, "designSettings", "Design"),
            ]),
        ),

      S.divider(),

      S.listItem().title("Homepage").child(singletonEditor(S, "homepage", "Homepage")),

      S.listItem()
        .title("Arena")
        .child(
          S.documentTypeList("sportPage")
            .title("Sport pages")
            // One page per sport that exists in the booking system.
            .filter('_type == "sportPage"'),
        ),

      S.listItem()
        .title("Café")
        .child(
          S.list()
            .title("Café")
            .items([
              singleton(S, "cafePage", "Café page"),
              S.listItem()
                .title("Menu categories")
                .child(S.documentTypeList("menuCategory").title("Menu categories")),
              S.listItem()
                .title("Menu items")
                .child(S.documentTypeList("menuItem").title("Menu items")),
            ]),
        ),

      S.listItem()
        .title("What's on")
        .child(
          S.list()
            .title("What's on")
            .items([
              S.listItem()
                .title("Events")
                .child(S.documentTypeList("event").title("Events")),
              S.listItem()
                .title("Offers")
                .child(S.documentTypeList("offer").title("Offers")),
            ]),
        ),

      S.divider(),

      S.listItem()
        .title("Gallery")
        .child(S.documentTypeList("galleryCollection").title("Gallery collections")),

      S.listItem()
        .title("Testimonials")
        .child(
          S.list()
            .title("Testimonials")
            .items([
              S.listItem()
                .title("Approved")
                .child(
                  S.documentList()
                    .title("Approved")
                    .filter('_type == "testimonial" && isApproved == true'),
                ),
              S.listItem()
                .title("Awaiting approval")
                .child(
                  S.documentList()
                    .title("Awaiting approval")
                    .filter('_type == "testimonial" && isApproved != true'),
                ),
            ]),
        ),

      S.listItem().title("FAQs").child(S.documentTypeList("faq").title("FAQs")),

      S.divider(),

      S.listItem()
        .title("About & contact")
        .child(
          S.list()
            .title("About & contact")
            .items([singleton(S, "aboutPage", "About"), singleton(S, "contactPage", "Contact")]),
        ),

      S.listItem()
        .title("Policies")
        .child(S.documentTypeList("policyPage").title("Policy pages")),
    ]);

/** A singleton list item: opens the one document, with no way to create a second. */
function singleton(S: Parameters<StructureResolver>[0], type: string, title: string) {
  return S.listItem().title(title).id(type).child(singletonEditor(S, type, title));
}

function singletonEditor(S: Parameters<StructureResolver>[0], type: string, title: string) {
  return S.document().schemaType(type).documentId(type).title(title);
}

/** Singletons cannot be created or deleted from the Studio, only edited. */
export const singletonActionsFilter = (input: {
  schemaType: string;
  actions: readonly unknown[];
}) =>
  SINGLETON_TYPES.has(input.schemaType)
    ? input.actions.filter((action) => {
        const name = (action as { action?: string }).action;
        return name !== "unpublish" && name !== "delete" && name !== "duplicate";
      })
    : input.actions;

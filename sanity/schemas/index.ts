import type { SchemaTypeDefinition } from "sanity";
import { objectSchemas } from "./objects";
import { designSettings, navigation, siteSettings } from "./documents/settings";
import {
  aboutPage,
  cafePage,
  contactPage,
  homepage,
  policyPage,
  sportPage,
} from "./documents/pages";
import {
  event,
  faq,
  galleryCollection,
  menuCategory,
  menuItem,
  offer,
  testimonial,
} from "./documents/catalogue";

/**
 * Every schema the Studio knows about.
 *
 * Note what is NOT here: bookings, customers, payments, orders. Operational and personal
 * data lives in Postgres and never enters a Sanity dataset — a public CMS dataset is the
 * wrong place for a customer's phone number, and Sanity is not the booking database.
 */
export const schemaTypes: SchemaTypeDefinition[] = [
  ...objectSchemas,

  // Singletons
  siteSettings,
  designSettings,
  navigation,

  // Pages
  homepage,
  sportPage,
  cafePage,
  aboutPage,
  contactPage,
  policyPage,

  // Catalogue
  menuCategory,
  menuItem,
  event,
  offer,
  galleryCollection,
  testimonial,
  faq,
];

/** Documents that must exist exactly once, keyed by a fixed id. */
export const SINGLETON_TYPES = new Set([
  "siteSettings",
  "designSettings",
  "navigation",
  "homepage",
  "cafePage",
  "aboutPage",
  "contactPage",
]);

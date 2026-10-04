# Menu management

The complete menu is managed in `/admin/menu`. PostgreSQL owns the item record: name,
category, description, dietary tags, allergen information, price, sizes, availability,
featured placement, display order and publication status.

Photo files live in Sanity's asset storage. Admin uploads the file; PostgreSQL stores
its Sanity asset ID, URL, dimensions and alt text. Staff do not create a separate CMS
menu document. Replacing or removing a photo changes the reference; existing assets
are retained so historical references are not broken.

## Staff workflow

1. Add an item in Admin and enter its details. Save it as a draft if its price is unknown.
2. Upload a PNG, JPEG or WebP photo up to 2 MB and describe it with alt text.
3. Enter the base price and optional sizes, with the full price for each size.
4. Mark it Published when it is ready. Publishing requires a price.
5. Select Featured to include it on the homepage and café page.
6. During service, mark an item sold out; it stays visible with that status.
7. Archive an item to hide it from the website while keeping its records. Restore it by
   changing its publication status back to Published.

Dietary and allergen wording must come from the kitchen. If it has not been supplied,
leave those fields empty. The menu displays supplied allergen notes and directs people
to ask the team when they need more information.

Menu, café and homepage data are rendered at request time, so imports and availability
changes appear on the next page refresh. Saving also refreshes their routes and Admin menu. Menu changes no longer rely
on a Sanity document webhook. The webhook still handles connected website content.

## Deploying the transition

Use the same PostgreSQL database and Sanity project/dataset as the deployed app.

1. Apply the additive schema change: `npm run db:migrate`. Existing items remain published;
   their prices, availability and variants are preserved.
2. Configure `SANITY_API_WRITE_TOKEN` on Vercel for Admin photo uploads. It must have asset
   write access and remain server-only. Set the same project/dataset variables used by Studio.
3. Deploy the updated app. Existing Studio menu records become read-only and Studio links
   to Admin. Records and assets are not deleted.
4. Preview the published legacy menu import: `npm run menu:import`.
5. After deploying the updated app, run `npm run menu:import -- --apply`.
6. Refresh Admin and the public menu. Complete imported drafts with a real price and
   availability, then publish them.

Do not import new unpriced drafts before deploying the updated app: older code does
not filter publication status or handle null prices.

The importer matches records by slug once. For existing database items it imports the
CMS name, description, tags, allergen note, featured flag and image reference. It leaves
operational category, price, variants, publication status and availability intact.

A Sanity-only item becomes a private draft with no price and unavailable status. The
importer records the Sanity document ID; subsequent runs preserve imported records,
including later staff edits. Records already saved through the new Admin are also
preserved on the first import. Duplicate slugs or missing required title/slug/category
stop the import before any changes. The whole apply operation is transactional.

Unpublished Sanity drafts are not imported. Publish an intended legacy record before
running the importer, or recreate its content in Admin. Imports do not change Sanity.

## Ownership

Sanity continues to own connected site settings, hero content, navigation, FAQs and
sport editorial content. Legacy `menuItem` and `menuCategory` schemas remain available
only as read-only import sources. The Sanity seeder no longer creates menu records.
The database seed adds sample menu items only when their slugs do not exist, preserving
staff edits and stable item IDs on reruns.

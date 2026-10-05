# Where to update app content

This describes the current app readers, rather than everything available in Studio.
The menu changes require deploying the updated code and importing legacy records as
described in [MENU-MANAGEMENT.md](MENU-MANAGEMENT.md).

## Sanity Studio

| Content | Connected fields |
| --- | --- |
| Site settings | Brand, tagline, city, address, map, coordinates, phone, WhatsApp, email, hours note and social links |
| Homepage | Hero headline/lines, subhead, location label, CTA links and leading slideshow image |
| Navigation | Primary header links |
| Sports | Blurb and hero image, matched to a database sport by slug |
| FAQs | Questions, answers and display order on About |

Publish the document in Studio. The signed webhook refreshes the relevant cached
content; refresh the website to see it. Saving an unpublished draft does not update
the public website.

Studio also contains fields/documents that the public app does not currently read:
homepage intro, marquee and amenities; dedicated Café/About/Contact page copy;
design tokens; gallery; event/offer editorial documents; legal content; hero video; footer link
groups and navigation closing statement. Editing those does not change the app until
their readers and components are connected. Layout, styling and much page copy remain
in code and require a code change and deployment.

## PostgreSQL and Admin

| Data | What it controls |
| --- | --- |
| Complete menu | Names, categories, descriptions, dietary tags, allergens, prices, variants, availability, featured placement, order, draft/published/archived status and photo references; edit at `/admin/menu` |
| Sports and pricing | Active sports, display names, physical resources, booking rates and operational rules |
| Schedule | Opening hours, slots and closures |
| Bookings and customers | Court requests, allocations, statuses and customer records |
| Payments | Payment records, verification and private payment proof files |
| Café operations | Tables and reservation records |
| Events | Public event titles, dates, prices, publication, capacity and registrations |
| Other operations | Discount rules, inquiries, staff permissions, feature flags and audit records |

Database ownership does not mean every field has a staff editor. Use the available
Admin screen; fields without an editor need a database/backend change.

Menu saves refresh Admin, the homepage, Café and Menu routes. Those public pages read
current menu data at request time. Published items appear; drafts and archived items
stay hidden. Sold-out items stay visible with their availability status.

Cricket and Futsal share one physical court in the database. CMS descriptions and
photos do not change that resource allocation or permit overlapping bookings.

## Menu photos and legacy content

Upload menu photos through Admin. Files live in Sanity asset storage; PostgreSQL stores
the asset ID, URL, dimensions and alt text. No separate Sanity menu document is created.
Vercel needs the server-only `SANITY_API_WRITE_TOKEN` for uploads.

Legacy Sanity menu documents are read-only import sources. A one-time import merges
their editorial details into matching database items while preserving prices and
availability; new Sanity-only items become unpriced drafts. After deployment and a
successful import, legacy menu documents/categories can be removed. Keep photo assets
that database items reference. The Sanity seeder no longer creates menu records.

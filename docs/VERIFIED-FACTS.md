# MadHaus — Verified facts, assumptions, and gaps

Last verified: 2026-10-01 by direct inspection of the venue's own public social profiles.
Nothing here has been re-checked since; treat it as a snapshot of that date.

## 1. Verified (sourced from the venue's own channels)

| Fact | Value | Source |
|---|---|---|
| Brand display name | **MadHaus** | Instagram profile name + Facebook page name (both render exactly `MadHaus`) |
| Social handle | `themadhauspk` | Instagram, Facebook, TikTok |
| City | Sahiwal, Pakistan | Instagram bio, Facebook bio |
| Positioning claim | "Sahiwal's First Padel Court" | Instagram bio, Facebook bio |
| Padel | Present | Both bios |
| Cricket | Present — described as "Cricket Court" | Facebook bio ("Cricket Court"), Instagram bio ("Cricket") |
| Café / food | Present — "Food court & Coffee" | Instagram bio; Facebook says "Food court" |
| Opening hours | **5:00 pm – 3:00 am** | Instagram bio ("Timings: 5pm to 3am") |
| Service modes advertised | Dine-in, Takeaway, Delivery | Instagram bio |
| Venue tagline (their own words) | **"Your new hangout spot"** | Facebook bio |
| Instagram audience | 2,132 followers / 147 posts | Instagram meta description |
| Facebook audience | 856 followers | Facebook meta description |

## 2. Discrepancies against the original brief — need owner confirmation

1. **Name spelling.** The brief supplied `THE MADHAUS` as a provisional name. Both official profiles
   render the brand as **`MadHaus`** (the `the` appears only inside the handle `themadhauspk`).
   The site therefore ships with `MADHAUS` as the wordmark, and the full name is a Sanity setting
   (`siteSettings.brandName`) so the owner can change it in one place without a code change.

2. **Football is not mentioned anywhere on either public bio.** Both bios list only padel, cricket
   and food. The brief states that football and cricket share one multipurpose court. Football is
   implemented in full, but ships **disabled by default** (`sports.is_active = false` for football
   in the seed) so it cannot appear publicly until the venue confirms it. Enabling it is one row.

3. **Delivery is advertised on Instagram but delivery operations are not built.** Delivery
   is not advertised on this site. The `cafe.delivery` feature flag exists and is `false`.

4. **"Sahiwal's First Padel Court" is a marketing claim by the venue.** It is stored as editable CMS
   copy, not hardcoded, and is not emitted as structured data.

5. **Opening hours drive the whole system.** The 5pm–3am range from the Instagram bio is
   seeded for every day and is what generates bookable slots, defines a "trading night" on
   the dashboard, and decides whether a requested time is inside opening hours. If any day
   differs, change it at `/admin/schedule`.

## 3. NOT verified — must be supplied before production

These are the production blockers for content. Every one is a Sanity field or a DB row today,
populated with clearly-labelled sample data.

- Street address and map coordinates (only the city, Sahiwal, is confirmed)
- Phone number and WhatsApp number
- Contact email address
- **All prices** — court hourly rates, peak/off-peak split, café menu prices
- Court dimensions, surface type, floodlight details, amenity list
- Menu items, variants, dietary tags, allergen information
- Whether opening hours vary by day (the bio gives a single 5pm–3am range)
- The JazzCash account title and number customers transfer to
- An email inbox for booking alerts, and a domain to send from
- Cancellation, rescheduling and no-show policy text
- Logo files (vector), brand fonts, brand colour values
- Photography and video of the courts, food and interior
- Any coaching, membership, tournament or package offering
- Customer reviews (none are shipped; the reviews section hides itself when empty)
- Legal entity name and details for Terms / Privacy

## 4. Design system provenance

The colour palette in `src/app/globals.css` is the **brief's suggested direction**, not sampled from
brand assets. It is defined as CSS custom properties in one place and mirrored into a Sanity
`designSettings` document so it can be re-pointed at the real brand palette without touching
components.

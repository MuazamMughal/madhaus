# What the venue still needs to supply

Everything here is a content or business decision, not an engineering task. Each item says
where it goes and what happens today in its absence.

Nothing in this list is invented anywhere in the site. Where a fact is missing, the page
either omits the section or states plainly that it is being confirmed.

---

## Blocking launch

### Prices

**These are now editable by the venue, no developer needed.**

| What | Where it goes | Today |
|---|---|---|
| Court rates per hour, per sport | **`/admin/pricing`** | Seeded `SAMPLE` rates so the booking flow runs; every price on the site is marked indicative |
| Peak / off-peak split and times | **`/admin/pricing`** | Sample bands: standard, 20:00–23:00 peak, 23:00–03:00 late |
| Weekend rates, if different | **`/admin/pricing`** | A sample Friday/Saturday band exists to prove the mechanism |
| Menu prices | **`/admin/menu`** | Sample prices against `SAMPLE —` item names |
| Equipment hire, if offered at all | `addons` table — no UI yet | Two sample add-ons; whether hire exists is unconfirmed |

Set `pricing.isSample` to `false` in `/admin/settings` once real prices are in, and the
"indicative" notes disappear across the site.

`/admin/pricing` also flags any stretch of the trading night with **no rate at all** — the
engine refuses to quote an unpriced minute rather than charging zero, so customers simply
cannot book those times until a rate covers them.

### Contact and location

| What | Where it goes | Today |
|---|---|---|
| Street address | Sanity → Site settings → `addressLines` | The Visit section shows "being confirmed" and points at the contact form |
| Map coordinates / directions link | Sanity → Site settings | No map pin; the directions button does not render |
| Phone number | Sanity → Site settings | No phone links anywhere |
| WhatsApp number | Sanity → Site settings | No WhatsApp buttons |
| Email address | Sanity → Site settings | No email links |

Only the **city** (Sahiwal) is confirmed, from both official profiles.

### The menu

Names, categories and prices are editable at **`/admin/menu`**; descriptions and photos
live in the Studio, matched by slug.

| What | Today |
|---|---|
| Real dish names, categories, prices | Six `SAMPLE —` items exercising the menu UI. Editable at `/admin/menu` |
| Descriptions and photos | Sanity, once connected |
| **Allergen information** | **None shown.** The page says to speak to the team. A wrong allergen claim can make someone ill, so nothing is guessed |
| Dietary tags (vegetarian, vegan, …) | None shown, for the same reason |
| Which items are available for takeaway | Not modelled until the venue confirms |

### Payment and contact details

| What | Where |
|---|---|
| JazzCash account title and number | `JAZZCASH_ACCOUNT_TITLE`, `JAZZCASH_ACCOUNT_NUMBER` |
| The inbox that receives booking alerts | `VENUE_NOTIFICATION_EMAIL` |
| A verified sending domain for email | Resend — needs DNS access |

Leave the JazzCash details blank and online payment is simply not offered; customers only
see "pay at the venue" and nothing breaks. Leave the email unset and **the venue is never
told a request came in** — that one does break the flow.

### Legal

`/privacy`, `/terms` and `/cancellation-policy` ship as **drafts** and say so in a visible
banner on each page. They need review against how the business actually operates and
against Pakistani consumer and data protection law. Specifically outstanding:

- The registered legal entity name and address.
- A named contact for privacy requests.
- The data retention period.
- Refund timescales per payment method.
- House rules: age limits, footwear, equipment, liability.

Set `reviewedByBusiness` on each policy document in the CMS to clear the banner.

### Decisions

- **Is football actually offered?** Neither the Instagram nor the Facebook bio mentions it;
  both list only padel, cricket and food. It is implemented in full and seeded **inactive**.
  Enabling it is one boolean, and it immediately appears in booking, pricing and the
  sitemap.
- **Is the brand "MadHaus" or "THE MADHAUS"?** Both official profiles render it as
  **MadHaus**; only the handle contains "the". The site uses `MadHaus`, as one editable
  setting.
- **Is delivery offered?** Instagram advertises it. No delivery operation is built here and
  the flag is off, so the site does not advertise it.
- **Do opening hours vary by day?** The bio gives one range (5pm–3am) and it is applied to
  every day. If any day differs, change it at **`/admin/schedule`** — no developer needed.
- **Is "Sahiwal's First Padel Court" a claim the venue wants on the site?** It is their own
  wording, held as editable CMS copy and never emitted as structured data.

---

## Photography

No photography of the venue has been supplied. Rather than use stock imagery that
misrepresents the place, every image slot renders a designed graphic — court markings drawn
in the brand palette — with a small note naming the shot that belongs there.

Shots needed, roughly in priority order:

1. **Hero** — the courts under floodlights with people playing. Landscape, 2000px+ wide.
   This one image does more for the page than the rest combined.
2. **Padel court**, in play, at night.
3. **Multipurpose court** under floodlights — ideally one set up for cricket and one for
   football, which also makes the shared-court story legible.
4. **Food**, close up and warmly lit. Three or four dishes.
5. **Coffee** being made or served.
6. **The café space** with people in it.
7. **The crowd** — courtside, watching, between games.
8. **Logo** as vector (SVG or AI). The wordmark is currently set in type.

Upload through Sanity. Alt text is **required** by the schema — an image cannot be
published without it.

### Optional

A short, muted hero video (10–20 seconds, looping, MP4). If supplied it **must** come with
a poster frame; the schema enforces this, because that frame is what people who prefer
reduced motion see instead.

---

## Reviews

**None are shipped, and none are invented.** The reviews section hides itself entirely
while empty, and no review structured data is emitted.

To publish one: add a testimonial in Sanity, record where it came from, and tick both
"they have agreed to this being published" and "approved". The first is enforced by
validation — reproducing someone's words and name without their say-so is not ours to do.

---

## Nice to have

- A short founding story for `/about`. The page is deliberately brief without one rather
  than padded with invented history.
- Facility details: court dimensions, surface, floodlight hours, parking, changing rooms,
  seating capacity. None are claimed today.
- Coaching, memberships, packages or tournaments, if any exist.
- A downloadable PDF menu.

# What the system does

Every feature, who it is for, and what it is deliberately not. Written to be read by
whoever runs the venue as much as by whoever maintains the code.

Three audiences use this system:

| | Where | Who |
|---|---|---|
| **Customers** | the public site | Anyone booking a court or reading the menu |
| **Staff** | `/admin` | The front desk, the arena manager, the kitchen, the owner |
| **Editors** | `/studio` | Whoever writes the copy and uploads the photographs |

---

## 1. The central rule

**MadHaus has two physical courts, not three.**

```
Padel Court           → padel only
Multipurpose Court    → football OR cricket, one at a time
```

Booking cricket takes that time off the board for football, and the other way round. This
is not enforced by application code that could be bypassed — it is a Postgres exclusion
constraint on a single `reservations` table that every form of occupancy writes to:

```sql
EXCLUDE USING gist (resource_id WITH =, during WITH &&) WHERE (blocks_availability)
```

Bookings, pending requests, maintenance blocks and event takeovers all live in that one
table, so one rule covers all of them. Ten simultaneous requests for the same slot produce
exactly one booking — that is a test, not a claim.

The shared court also carries a **20-minute changeover** between different sports (nets
down, goals out). Two cricket bookings can run back to back; cricket followed by football
cannot.

---

## 2. How a booking happens

Every online booking is a **request**. The venue decides each one by hand, because staff
know about walk-ins and phone bookings the system never sees.

```
Customer picks a slot, fills in details, chooses how they will pay
   │
   ▼  slot RESERVED immediately — others see it as "Pending" in amber
   ▼  customer emailed a receipt; VENUE emailed the full details
   ▼  appears at the top of /admin
   │
Staff ring the customer, then decide
   │
   ├── DECLINE ──▶ slot freed instantly, customer told why
   │
   ├── APPROVE, paying at venue ──▶ CONFIRMED
   │                                 money collected on arrival
   │
   └── APPROVE, paying online ────▶ still pending
                                     JazzCash link emailed
                                        │
                                        ▼ customer transfers, submits transaction ID
                                        ▼ venue emailed; checks it against the account
                                        │
                                        └── ACCEPT ──▶ CONFIRMED + paid
                                                       .ics calendar invite,
                                                       1-hour reminder
```

### What the customer sees

A slot in the grid is in one of three states:

| Appearance | Meaning |
|---|---|
| Normal | Free — click to book |
| **Amber, "Pending"** | Someone has requested it, the venue has not decided. **May still come free** |
| Grey, struck through | Booked, under maintenance, or the court is changing over |

The distinction matters: telling someone a requested slot is "booked" would be wrong if
the venue declines it an hour later. A legend on the page explains the amber state.

### Things the copy refuses to say

- A request is **never** called a confirmed booking.
- A transaction ID a customer typed in is **never** called a payment received.
- A `wa.me` link is **never** described as a message having been sent. It opens a draft;
  nothing leaves until the customer presses send.

---

## 3. Payment

Two ways money arrives. There is no card gateway and no webhook, by design.

### Pay at the venue (the default)

Nothing to pay online. The booking is confirmed when staff approve it, and the payment
status stays `unpaid` until someone takes the money at the desk.

**Booking status and payment status are separate fields.** A booking can be *confirmed and
unpaid* (the common case here) or *cancelled and paid* while a refund is arranged.
Collapsing them into one field makes real situations impossible to represent.

### JazzCash, by hand

The customer is shown the venue's JazzCash account, transfers it themselves, and submits
the transaction ID plus an optional screenshot. Staff match it against the account in
`/admin/payments`.

Rules the system enforces:

- **Cannot pay before the slot is approved.** Paying for a court nobody has agreed to give
  you is the wrong order.
- **A transaction ID is a claim.** Submitting one sets `pending_verification`, never
  `paid`.
- **Rejecting keeps the court held.** A mistyped transaction ID does not cost the customer
  their slot; they resend.
- **The payment link cannot cancel a booking.** It is a separate single-purpose token, so
  forwarding it does not hand over control.

Screenshots are capped at 2 MB, limited to PNG/JPEG/WebP, stored in Postgres, and served
through a permission-checked route — never a public URL.

---

## 4. Time

The venue trades **17:00 to 03:00**. That one fact shapes the whole system.

- Every instant in the database is UTC. Every time a person sees is Asia/Karachi, resolved
  through `Intl` — never a hardcoded `+05:00`.
- A **business day** is a trading night. A 01:30 session on Thursday belongs to
  Wednesday's night. The dashboard, the reports and the date pickers all use this, with a
  05:00 rollover.
- Sessions crossing midnight are the normal case, not an edge case.

---

## 5. Pricing

Integer minor units (paisa) throughout. No floating-point money anywhere.

Rates are stored **per hour** and pro-rated **per minute** across bands, so a session
starting off-peak and running into peak is charged for exactly what it uses:

```
19:30–21:00 padel, Friday
  19:30–20:00   30 min @ Rs 3,000/hr  off-peak   Rs 1,500
  20:00–21:00   60 min @ Rs 4,500/hr  PEAK       Rs 4,500
                                      Total      Rs 6,000
```

- **The price is always computed on the server.** The browser is told what a booking
  costs; it is never asked. The form carries the quoted total only so a *mismatch* can be
  detected and the customer re-shown the new price.
- **Existing bookings are never re-priced.** Every booking carries a frozen
  `pricing_snapshot`. A price rise applies from that moment and to nothing already agreed.
- **An unpriced minute refuses to quote** rather than charging zero. `/admin/pricing`
  shows these gaps in red, because customers simply cannot book those times.

Higher `priority` wins where bands overlap; ties break towards the more expensive rate,
never the cheaper one.

---

## 6. Customer-facing pages

| Route | What it does |
|---|---|
| `/` | Homepage — hero, quick availability check, sports, café, venue, gallery, visit |
| `/arena` | Overview, and an honest explanation of the shared court |
| `/arena/[sport]` | One page per **active** sport, with live availability for tonight and the real rate table |
| `/book` | The booking flow. Live slots, server-computed price breakdown, request form |
| `/booking/[reference]` | A customer's own booking — status, cancel, reschedule, add to calendar |
| `/booking/[reference]/pay` | JazzCash details and the transaction-ID form |
| `/cafe` | The café, with table requests when enabled |
| `/menu` | Searchable, filterable menu with live prices and sold-out states |
| `/events`, `/events/[slug]` | Events. Hides itself entirely when nothing is on |
| `/offers` | Live coupons only — what is shown is what checkout will honour |
| `/gallery`, `/about`, `/contact` | Editorial, plus the enquiry form |
| `/account` | A customer's bookings, or a way back into one from its link |
| `/privacy`, `/terms`, `/cancellation-policy` | Drafts, visibly marked as needing review |

Accounts are **optional**. A name and a phone number is all a booking needs.

### Secure booking access

A reference like `MH-7F3K2Q9X` is designed to be read over a noisy phone line, so it is
**not a credential**. Opening a booking also needs a token from the confirmation link,
compared in constant time against a stored SHA-256 hash. A wrong token, a missing token
and a nonexistent reference all behave identically.

> **Known limitation.** Next.js commits to HTTP 200 once streaming begins, so these return
> 200 with the not-found page rather than a 404 status. No customer data is served, and
> Next injects `<meta name="robots" content="noindex">`. `/booking/` is also disallowed in
> `robots.txt`.

---

## 7. The staff dashboard

Ten pages at `/admin`, behind a sign-in, plus a walk-in booking form at
`/admin/bookings/new`.

| Page | What staff do there |
|---|---|
| **Tonight** | Requests awaiting a decision, the night's schedule by court, counters, walk-ins, check-in |
| **Bookings** | Search by reference, name or phone. Cancel, reschedule, check in |
| **Payments** | Verify JazzCash transaction IDs. View submitted screenshots |
| **Rates** | Court prices, peak bands, days, priority. Shows unpriced gaps |
| **Hours** | Opening and closing per day, or close a day entirely |
| **Menu** | Prices, categories, one-click sold out |
| **Café** | Table requests, and which café services are switched on |
| **Enquiries** | Contact-form messages, with reply links |
| **Reports** | Collected vs. owed, occupancy by court, outcomes, café totals |
| **Settings** | Feature flags, booking windows, and an integration status board |

### The confirmation call

The venue rings every customer before locking a slot, so the queue is built around that:
the phone number is a **tap-to-call button**, with WhatsApp and email beside it. Approving
opens a short step asking what was agreed — *"Spoke to Ayesha, confirmed 8pm, bringing 3
others"* — which is stored on the booking, written to the audit log, and shown later on
the schedule and in search.

### Money, reported honestly

**Collected** and **still owed** are never added together. The first comes from payment
records and is revenue; the second is expected income on unpaid bookings. Both are
labelled on screen.

### Roles

Five roles, 22 granular permissions, enforced **on the server for every operation**.
Hiding a button is presentation, not authorisation.

| Role | Can |
|---|---|
| **Owner** | Everything |
| **Arena manager** | Bookings, approvals, maintenance, rates, hours, verify payments, reports |
| **Café manager** | Table requests, orders, menu, view bookings, reports |
| **Reception** | View and create bookings, approve requests, check in |
| **Content editor** | The Studio only |

---

## 8. Content management

```
Sanity  ──▶  words, pictures, editorial pages, menu descriptions, policies
Postgres ─▶  bookings, availability, customers, payments, prices, hours, staff, audit
```

Sanity is **not** the booking database, and no customer's personal data ever enters a
Sanity dataset. Where both describe the same thing — a menu item, an event, an offer — the
database owns what is transactional (price, stock, capacity, discount) and Sanity owns how
it reads. A price on screen always comes from the database, so the site and the till cannot
disagree.

16 document types, with required alt text on every image, hotspot cropping, singletons that
cannot be duplicated, and a constrained editor rather than a free-form page builder.

Publishing fires a signed webhook that revalidates only the affected pages. No deploy.

### Running without Sanity

The whole site runs with no CMS credentials, on labelled sample content. While it does:
every page shows a **placeholder banner**, and `robots.txt` disallows everything —
placeholder prices in search results would misrepresent a real business.

---

## 9. Email

Every step of the flow is an email. Without it, the venue is never told a request came in.

| When | To | Carries |
|---|---|---|
| Request submitted | Customer | "Not confirmed yet" |
| Request submitted | **Venue** | Full details + link to decide |
| Approved, pay at venue | Customer | Confirmation + `.ics`, 1-hour reminder |
| Approved, pay online | Customer | The JazzCash link |
| Payment submitted | **Venue** | Transaction ID to check |
| Payment accepted | Customer | Confirmation + `.ics`, 1-hour reminder |
| Declined | Customer | Why, and a link to find another time |
| Payment not matched | Customer | Ask them to check and resend |
| Cancelled / rescheduled | Customer | The change |

Messages are written to a **durable outbox in the same transaction as the booking**, then
delivered by a worker with exponential backoff and deduplication. A mail outage delays a
message; it can never lose a booking. Failures that will never succeed are parked as dead
for a human rather than retried forever.

---

## 10. Accessibility and performance

- Semantic HTML, keyboard navigation throughout, visible focus rings that adapt to each
  surface.
- Status is **never carried by colour alone** — always colour plus text plus an icon.
- Form errors are tied to their inputs with `aria-describedby` and `aria-invalid`;
  summaries are live regions.
- Disabled controls explain *why* rather than being hidden.
- Touch targets are at least 44px.
- `prefers-reduced-motion` stops all movement in CSS; nothing meaningful disappears.
- Alt text is required by the CMS schema — an image cannot be published without it.
- Fonts self-hosted and subset via `next/font`. No third-party scripts, no analytics, no
  social embeds. Most pages ship no client JavaScript beyond the header.

**What is cached, and what deliberately is not.** Pages showing configuration — sports,
prices, hours, menu, editorial — are prerendered and served from the CDN, and a Sanity
publish revalidates them by tag without a rebuild. Pages showing live or per-visitor state
are rendered per request: `/book`, `/booking/[reference]`, `/account` and all of `/admin`.

`/arena/[sport]` belongs in the second group for a reason worth recording. It shows
tonight's remaining slots. Prerendered, those slots freeze at build time and the CDN keeps
serving them for days, telling a customer a court is free that was booked last week. A
stale availability claim is worse than no claim, so every page making one is dynamic.

The cost is that the build reads the database: an unmigrated or unreachable Postgres fails
the build rather than the first request.

> **Performance has not been measured.** No Lighthouse score is claimed anywhere, because
> none has been run against a production deployment with real images. Measure it once the
> photography is in — that is what will decide the numbers.

---

## 11. Security and privacy

- Passwords hashed with scrypt (Node built-in, no native dependency). Sessions are opaque
  random tokens stored as hashes, so a database leak hands out nothing.
- Every protected operation re-checks permissions on the server.
- Rate limiting on booking, enquiries, payment proof and sign-in — per client *and* per
  account, so neither a single attacker nor a distributed one gets unlimited attempts.
- Sign-in failures are indistinguishable whether or not the account exists, and take the
  same time.
- Contact-form IPs are **hashed**, not stored.
- No analytics, no advertising trackers, no third-party cookies. The only cookies are
  session cookies, which is why there is no consent banner — there is nothing optional to
  consent to.
- Audit log records who did what, with before and after values.

---

## 12. Deliberately switched off

Each of these is built far enough that enabling it is a settings change. Each is off
because enabling it would mean claiming something untrue.

| Flag | Off because |
|---|---|
| `cafe.tableInstantConfirm` | Instant confirmation needs real table capacity. Requests go to staff, and the copy says "request" |
| `cafe.pickupOrders` | The kitchen has not confirmed it will run an online queue |
| `cafe.delivery` | Advertised on Instagram, but no delivery operation is built |
| `events.registration` | No real event with real capacity exists yet |
| `reviews.enabled` | No approved, attributable reviews supplied. None are invented, and no review structured data is emitted |
| `gallery.socialEmbeds` | Embeds load third-party JavaScript on first paint and break when the network changes |
| `pricing.isSample` | Rates are placeholders. While true, every price is marked "indicative" |
| `content.isSample` | Sample copy. While true, a banner shows and `robots.txt` disallows everything |

Football is seeded **inactive**: neither public profile mentions it. It is built in full;
enabling it is one boolean.

---

## 13. Not built

Honest list. Nothing below is half-wired or pretending.

| | Why |
|---|---|
| **Staff account management** | No UI to add people or reset passwords. Needs SQL |
| **Discount codes** | The CMS describes an offer; the coupon checkout honours is a DB row with no editor |
| **Refunds** | The table exists; a JazzCash refund made by hand is not recorded anywhere |
| **Café add-ons at booking** | Pricing and storage work; the booking flow has no picker |
| **Pickup ordering** | Tables exist, no service layer or UI. Flag off |
| **Event registration** | Capacity is transactional, no registration flow. Flag off |
| **Customer sign-up** | Sessions work, no sign-up form. Guest booking is the default and unaffected |
| **Transaction export** | Reports render; no CSV download |
| **Audit log viewer** | Everything is recorded; no page shows it. Readable by SQL |
| **WhatsApp / SMS delivery** | Needs an approved Business API account and Meta-approved templates |
| **Card gateway** | Removed deliberately — the venue takes money at the desk or by JazzCash |

---

## 14. Verified by tests

109 tests across 10 files. Integration tests run against a real Postgres, because what they prove — the
exclusion constraint, advisory locks, transaction isolation under genuine concurrency —
exists only in Postgres. A mock would test the mock.

- Ten simultaneous requests for one slot → **exactly one booking**
- Football and cricket racing for the shared court → **exactly one booking**
- The changeover buffer applies between different sports, not the same one
- A request holds its slot; approving a pay-at-venue request confirms it unpaid; approving
  an online one does **not** confirm it; approving twice is idempotent
- Declining frees the slot and keeps the reason
- Payment cannot be submitted before approval or on a cancelled booking; oversized and
  non-image screenshots are refused
- Accepting a payment confirms and marks paid; rejecting leaves the court held
- The payment token opens the pay page but cannot open or cancel the booking
- Rescheduling keeps the reference; a failed reschedule leaves the original untouched;
  moving off-peak into peak reprices
- Changing a rate changes what is quoted, and is audited with before and after
- Changing opening hours changes which slots appear; closing a day empties it
- Staff bookings and maintenance block customer bookings; maintenance is refused over an
  existing booking
- An incomplete Sanity link resolves to `null` rather than a half-built `href`; forged,
  stale and unsigned webhook deliveries are all rejected
- A trading night runs from one 05:00 rollover to the next, so a 17:00 opener and a 02:40
  session count against the same night
- Phone normalisation, money arithmetic, the timezone model, pricing bands, route
  protection

Run with `npm run db:up && npm test`.

# Integrations and production blockers

What is genuinely connected, what is deliberately not, and what each one needs before the
site can take real money from real customers.

The application is complete and runnable without any of the unconfigured items below. What
they gate is *going live*, not development.

---

## Status at a glance

| Integration | Status | Blocks launch? |
|---|---|---|
| PostgreSQL | **Working** | — |
| Request → approve booking flow | **Working** | — |
| Pay at venue | **Working** | — |
| JazzCash (manual, staff-verified) | **Working** (needs the account details) | Yes, if paying online is wanted |
| Email via Resend | **Built** (needs an API key) | **Yes — the flow runs on it** |
| Payment simulator | Development only; refuses to run in production | — |
| Sanity CMS | **Working** (needs a project) | Yes |
| Scheduled jobs | **Working** (needs a scheduler) | Recommended |
| WhatsApp / SMS | Not implemented | No |

**There is no card gateway and no webhook, by design.** Money arrives two ways: cash or
card at the desk, or a manual JazzCash transfer a member of staff verifies before the
booking is confirmed.

---

## 1. Email (Resend) — THE CRITICAL ONE

The entire booking flow runs on email:

| When | Who is emailed | What it carries |
|---|---|---|
| A request is submitted | Customer | "We have your request — not confirmed yet" |
| A request is submitted | **The venue** | Full details + a link to approve or decline |
| Slot approved, paying at venue | Customer | Confirmation + `.ics` with a 1-hour reminder |
| Slot approved, paying online | Customer | The JazzCash payment link |
| Payment proof submitted | **The venue** | Transaction ID to check against the account |
| Payment accepted | Customer | Confirmation + `.ics` with a 1-hour reminder |
| Request declined | Customer | Why, and a link to find another time |
| Payment not matched | Customer | Ask them to check and resend |

**Without this, the venue is never told a request came in.** Everything is still recorded
correctly and visible in `/admin`, but nobody finds out without opening the dashboard.

To switch it on:

1. Create an account at [resend.com](https://resend.com) and add the venue's domain.
2. Verify the domain by adding the DNS records Resend gives you. Sending from an
   unverified domain lands in spam.
3. Set:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM="MadHaus <bookings@yourdomain.com>"
   VENUE_NOTIFICATION_EMAIL=the-venue-inbox@example.com
   NOTIFICATION_CHANNELS=email
   ```

`VENUE_NOTIFICATION_EMAIL` is resolved when a message is *sent*, not when it is queued, so
changing the venue's inbox does not strand messages already in the outbox.

Until it is configured, `NOTIFICATION_CHANNELS=log` renders every message to the server log
so the whole flow is exercisable with no credentials. Messages queue either way — a mail
outage delays a message, it can never lose a booking.

---

## 2. JazzCash — WORKING, NEEDS THE ACCOUNT DETAILS

Nothing here talks to JazzCash. The customer is shown the venue's account, transfers by
hand, and submits the transaction ID. A member of staff matches it against the account in
`/admin/payments` before the booking is confirmed.

```
JAZZCASH_ACCOUNT_TITLE="..."
JAZZCASH_ACCOUNT_NUMBER="03xx-xxxxxxx"
```

Leave them blank and online payment is simply not offered — customers only see "pay at the
venue". Nothing breaks.

**Rules the flow enforces, and that must not be loosened:**

- A customer cannot submit payment before staff have approved the slot. Paying for a court
  nobody has agreed to give you is the wrong order.
- A transaction ID is a **claim**. Submitting one sets `payment_status = pending_verification`,
  never `paid`.
- Rejecting a proof leaves the court **held** so the customer can resend. A mistyped
  transaction ID should not cost them the slot.
- Screenshots are optional, capped at 2 MB, and limited to PNG/JPEG/WebP. They are stored
  in Postgres and served through a permission-checked route — never on a public URL.

---

## 3. Scheduled jobs — NEEDS A SCHEDULER

```
POST /api/cron/run
Authorization: Bearer $CRON_SECRET
```

Every minute or two. It delivers queued email, releases requests nobody decided on, and
prunes expired sessions.

Under this flow the email delivery is the important part: without the cron running, queued
messages sit in the outbox and the venue is not alerted.

---

## 4. Sanity CMS — NEEDS A PROJECT

Schemas, Studio structure, singletons, validation, the embedded Studio at `/studio` and the
signed revalidation webhook are all built.

**To connect:**

1. Create a project at [sanity.io/manage](https://sanity.io/manage).
2. Set `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET`.
3. Create a **viewer** token for draft previews → `SANITY_API_READ_TOKEN`.
4. Add a webhook to `POST https://<your-domain>/api/revalidate`, signed with a secret that
   matches `SANITY_REVALIDATE_SECRET`.
5. Add the production domain to the project's CORS origins.

Until configured, the site runs on labelled sample content, shows a placeholder banner on
every page, and `robots.txt` disallows everything — placeholder prices in search results
would misrepresent the business.

---

## 5. Scheduled jobs — NEEDS A SCHEDULER

```
POST /api/cron/run
Authorization: Bearer $CRON_SECRET
```

Every minute or two. It releases expired holds, delivers queued notifications, and prunes
expired sessions and rate-limit buckets.

Not required for correctness — expired holds are also swept on every availability read and
at the start of every booking write — but without it a slot abandoned at 2am stays blocked
until someone next looks at that date.

---

## 6. Content and business decisions

These are not engineering tasks, but the site cannot launch without them. The full list is
in [`ASSETS.md`](ASSETS.md). The ones that block hardest:

- **Court prices.** The seeded rates are labelled `SAMPLE` and the site marks every price
  as indicative while `pricing.isSample` is true.
- **Street address, phone, WhatsApp number.** Only the city is confirmed. The site shows an
  honest gap rather than a plausible invented address.
- **Menu, with prices.** And **allergen information**, which is a safety matter — none is
  shown, and the menu page says to ask the team.
- **Legal review of `/privacy`, `/terms`, `/cancellation-policy`.** All three are drafts
  and say so on the page until `reviewedByBusiness` is set in the CMS.
- **Whether football is actually offered.** Neither public profile mentions it. It is built
  in full and seeded **inactive**; enabling it is one boolean.
- **Whether delivery is offered.** Instagram advertises it; no delivery operation is built
  here, and the flag is off.

---

## 7. Things deliberately switched off

Every one of these is implemented to the point where enabling it is a settings change, and
off because enabling it would mean claiming something untrue.

| Flag | Off because |
|---|---|
| `cafe.tableInstantConfirm` | Instant confirmation needs real table capacity. Without it, requests go to staff and the copy says "request", not "booking". |
| `cafe.pickupOrders` | The kitchen has not confirmed it will run an online queue. |
| `cafe.delivery` | No delivery operation is built. |
| `events.registration` | No real event with real capacity exists yet. |
| `reviews.enabled` | No approved, attributable reviews have been supplied. None are invented, and no review structured data is emitted. |
| `gallery.socialEmbeds` | Embeds load third-party JavaScript on first paint, and a page that scrapes a social network at request time breaks when that network changes. |

---

## 8. Not measured

Performance has **not** been measured on real hardware or a real network. No Lighthouse
score is claimed anywhere in this project, because none has been run against a production
deployment with real images.

What was done by construction: fonts self-hosted and subset through `next/font`, no
third-party scripts, no analytics, no social embeds, images handled by `next/image` with
explicit `sizes`, below-the-fold media lazy by default, and the client bundle kept small —
most pages ship no client JavaScript beyond the header.

Measure it once real photography is in place; images are what will decide the numbers.

---

## 9. Built but not surfaced in the interface

Working server-side, with no customer-facing UI yet. Each is a page, not a redesign.

| Capability | State |
|---|---|
| Café add-ons on a court booking | Pricing engine handles them and `booking_addons` persists them; the booking flow has no picker, so nothing can be added yet. The flag is on in anticipation. |
| Refunds | The `refunds` table exists and `payment_intents` tracks refunded amounts, but there is no UI. A JazzCash refund is made by hand in the app and is not currently recorded here. |
| Pickup ordering | Tables, order items and snapshots exist; no service layer or UI. Flag off. |
| Event registration | `events` and `event_registrations` exist with transactional capacity; no registration flow. Flag off. |
| Customer accounts | Sessions, hashing and `/account` all work; there is no sign-up or sign-in form, so nobody can create one. Guest booking — the default path — is unaffected. |
| Transaction export | `/admin/reports` renders the figures; there is no CSV download. |
| Audit log viewer | Every significant action is written to `audit_log`; the dashboard does not display it. Readable with SQL. |
| Sanity draft preview | The client supports a preview perspective and a viewer token; there is no draft-mode route to turn it on. |

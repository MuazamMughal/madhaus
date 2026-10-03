# MadHaus

Website, booking system and staff dashboard for **MadHaus** — a padel, cricket and café
venue in Sahiwal, Pakistan.

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · PostgreSQL · Drizzle · Sanity · Resend

---

## What this is

A public marketing site, a request-and-approve court booking system, and an operations
dashboard the venue runs itself.

The thing it is built around: **MadHaus has two physical courts, not three.** Padel has its
own; football and cricket share one multipurpose court. A cricket booking must take that
time off the board for football, and the other way round. That rule is enforced by a
Postgres exclusion constraint rather than application logic, so it holds under concurrent
requests, for staff bookings, and against hand-written SQL.

For the full feature list, see **[`docs/FUNCTIONALITY.md`](docs/FUNCTIONALITY.md)**.

---

## Quick start

```bash
# 1. Database (Docker). Serves Postgres 17 on port 5433.
npm run db:up

# 2. Environment
cp .env.example .env.local
#    Then set SESSION_SECRET:  openssl rand -base64 48

# 3. Install, migrate, seed
npm install
npm run db:migrate
npm run db:seed

# 4. Run
npm run dev
```

Open <http://localhost:3000>. The dashboard is at `/admin`; the seed prints the owner
account it created, and the password is `SEED_OWNER_PASSWORD` in `.env.development.local`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Full suite (needs the database running) |
| `npm run verify` | typecheck + lint + tests |
| `npm run db:up` / `db:down` | Start / stop Postgres |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:reset` | Drop everything and re-apply (development only) |
| `npm run db:seed` | Seed configuration and sample content |
| `npm run dev:session` | Mint a staff session token for local testing |
| `npm run check-login` | Confirm an email/password pair verifies |

### Environment files

- `.env.local` — database URL and secrets. Loaded in every environment.
- `.env.development.local` — development only. Holds the payment **simulator** and the
  sample JazzCash details, so `npm run build` behaves like production on your machine.

`serverEnv()` refuses to start if the simulator is enabled in production. That is
deliberate: a simulated success screen shown to a real customer is a lie.

---

## How a booking happens

Every online booking is a **request**. The venue decides each one by hand, because staff
know about walk-ins and phone bookings this system never sees.

```
Customer picks a slot and submits a request
   ↓  the slot is RESERVED and shows to everyone else as "Pending"
   ↓  the venue is emailed; the request appears at the top of /admin
Staff ring the customer, then approve or decline
   ├─ declined        → slot goes back on the board, customer told why
   ├─ paying at venue → CONFIRMED. Money collected on arrival.
   └─ paying online   → still pending. A JazzCash link is emailed.
                        ↓  customer transfers, submits the transaction ID
                        ↓  venue checks it against the account in /admin/payments
                        └─ accepted → CONFIRMED + confirmation email with a .ics
                                      calendar invite and a 1-hour reminder
```

Two things this design refuses to do:

- **A pending request holds the court.** Two customers cannot request the same slot, and
  staff cannot approve two overlapping requests. A request nobody decides on is released
  after `booking.requestHoldHours`, and never outlives the session it is for.
- **A transaction ID is a claim, not a payment.** Nothing confirms a booking because a
  customer typed something into a form. Only a member of staff who has checked the
  JazzCash account does that.

There is no card gateway and no webhook. Money arrives two ways: at the desk, or by a
manual JazzCash transfer a human verifies.

---

## What the venue changes without a developer

Every row below is a page in `/admin`. No SQL, no deploy.

| Page | Controls | Takes effect |
|---|---|---|
| **Tonight** | Approving and declining requests, the night's schedule, walk-ins, check-in | Immediately |
| **Bookings** | Search by reference, name or phone; cancel; reschedule | Immediately |
| **Payments** | Verifying JazzCash transaction IDs | Confirms the booking |
| **Rates** | Court prices, peak bands, which days a rate covers | New bookings only |
| **Hours** | Opening and closing times per day, closing a day entirely | The booking page |
| **Menu** | Prices, categories, sold-out | The public menu |
| **Café** | Table requests | Immediately |
| **Enquiries** | Contact-form messages | — |
| **Reports** | Collected vs. owed, occupancy, outcomes | — |
| **Settings** | Feature flags, booking windows, cancellation cutoffs | Immediately |

Two guarantees worth knowing:

- **Changing a rate never re-prices an existing booking.** Every booking carries a frozen
  `pricing_snapshot`.
- **Shortening a day does not cancel anything.** Bookings outside the new hours stay in the
  diary and still show on the dashboard; staff move them deliberately.

Words and pictures live in `/studio`. Prices and availability live in `/admin`, because the
price on the website has to be the price the till charges.

**Still needs a developer:** adding staff accounts, creating discount codes, recording
refunds.

---

## How it fits together

```
Sanity  ──▶  words, pictures, editorial pages, menu descriptions, policies
Postgres ─▶  bookings, availability, customers, payments, prices, hours, staff, audit
```

Sanity is **not** the booking database, and no customer's personal data ever enters a
Sanity dataset. Where both describe the same thing, the database owns whatever is
transactional and Sanity owns how it reads.

### The booking model

```
resources   one row per PHYSICAL thing that one party uses at a time
            ├── padel-court-1        (padel)
            └── multipurpose-court-1 (football AND cricket)

sports      a way of USING a resource; football and cricket share one resource_id

reservations  ONE table holding every kind of occupancy:
              confirmed bookings, pending requests, maintenance, event takeovers
```

Because every form of occupancy lives in one table, a single constraint guarantees no
overlap:

```sql
CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (resource_id WITH =, during WITH &&)
  WHERE (blocks_availability)
```

`during` is a `tstzrange` with half-open `[start, end)` bounds, so 18:00–19:00 and
19:00–20:00 do not overlap and back-to-back bookings are legal. It stores the *blocking*
window — play time plus changeover — while the booking row stores the play window the
customer sees.

On top of that, the write path takes a per-court advisory lock, so rules that must *read*
neighbouring bookings — the sport-change buffer especially — are race-free too. The
constraint is the invariant; the lock makes the conditional logic correct.

### Time

The venue trades **17:00 → 03:00**:

- Every instant in the database is UTC. Every schedule and displayed time is Asia/Karachi,
  resolved through `Intl` — never a hardcoded `+05:00`.
- A **business day** is a trading night. A 01:30 session on Thursday belongs to Wednesday's
  night, with a 05:00 rollover.

### Money

Integer minor units (paisa). No floats. Rates are per hour, pro-rated per minute, so a
booking spanning off-peak and peak is charged for exactly what it uses.

The price is **always** computed on the server. The form carries the quoted total only so a
mismatch can be detected and the customer re-shown the new price.

### Secure booking access

A reference (`MH-7F3K2Q9X`) is quotable over a noisy phone line, so it is **not** a
credential. `/booking/[reference]` also needs a token from the confirmation link, compared
in constant time against a stored hash. The payment page uses a *separate* single-purpose
token, so a forwarded payment link cannot cancel a booking.

---

## Testing

```bash
npm run db:up && npm test
```

92 tests. Integration tests run against a real Postgres, because what they prove — the
exclusion constraint, advisory locks, transaction isolation under genuine concurrency —
only exists in Postgres. A mock would test the mock.

- **Concurrency:** ten simultaneous requests for one slot produce exactly one booking.
  Football and cricket racing for the shared court produce exactly one booking.
- **The shared court:** football cannot be booked over cricket; padel is unaffected; the
  changeover buffer applies between different sports and not the same one.
- **The request lifecycle:** a request holds its slot; approving a pay-at-venue request
  confirms it unpaid; approving an online one does not; approving twice is idempotent;
  declining frees the slot and keeps the reason.
- **Payments:** proof cannot be submitted before approval or on a cancelled booking;
  oversized and non-image screenshots are refused; accepting confirms and marks paid;
  rejecting leaves the court held; the payment token cannot open the booking.
- **Rescheduling:** the reference survives; a failed move leaves the original untouched;
  off-peak into peak reprices.
- **Configuration:** changing a rate changes what is quoted and is audited with before and
  after; changing hours changes which slots appear; closing a day empties it.
- **Units:** phone normalisation, money arithmetic, the timezone model, pricing bands,
  route protection.

If the suite was interrupted partway it can leave the seeded config incomplete. It detects
this and tells you to run `npm run db:seed` rather than failing in thirty confusing places.

---

## Deployment

1. **Database.** Managed Postgres 17+ with the `btree_gist` and `pgcrypto` extensions, both
   in contrib. Run `npm run db:migrate` against it.
2. **Environment.** Everything in `.env.example`. `SESSION_SECRET` and `CRON_SECRET` must
   be freshly generated. Do not carry `.env.development.local` across.
3. **Email.** `RESEND_API_KEY`, `EMAIL_FROM`, `VENUE_NOTIFICATION_EMAIL`,
   `NOTIFICATION_CHANNELS=email`. **The booking flow runs on this** — without it the venue
   is never told a request came in.
4. **JazzCash.** `JAZZCASH_ACCOUNT_TITLE` and `JAZZCASH_ACCOUNT_NUMBER`. Leave blank and
   online payment is simply not offered.
5. **Build.** `npm run build && npm start`.
6. **Scheduled jobs.** Point a scheduler at `POST /api/cron/run` every minute or two with
   `Authorization: Bearer $CRON_SECRET`. It delivers queued email, releases undecided
   requests, and prunes sessions.
7. **Sanity.** Create a project, set `NEXT_PUBLIC_SANITY_*`, and add a webhook to
   `POST /api/revalidate` signed with `SANITY_REVALIDATE_SECRET`.
8. **Seed the first owner**, then change the password immediately.

Read **[`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md)** before going public — some
integrations are deliberately not wired up, and the site says so rather than pretending.

---

## Documentation

| File | What is in it |
|---|---|
| [`docs/FUNCTIONALITY.md`](docs/FUNCTIONALITY.md) | Every feature, who it is for, and what is deliberately not built |
| [`docs/VERIFIED-FACTS.md`](docs/VERIFIED-FACTS.md) | What was verified from the venue's own channels, what contradicts the brief, what is still unknown |
| [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) | Every live integration, its status, and what it needs before launch |
| [`docs/ASSETS.md`](docs/ASSETS.md) | The photography, copy and details the venue still needs to supply |

---

## Project layout

```
src/
  app/
    (public)/           the customer-facing site, with header and footer
    admin/
      sign-in/          reachable without a session
      (protected)/      the dashboard, behind requirePermission
    studio/             the embedded Sanity Studio
    api/                calendar downloads, cron, Sanity revalidation
  components/
    ui/                 design system primitives
    marketing/          public page sections
    booking/            the booking flow
    admin/              the dashboard
  lib/
    domain/             pure, tested business logic — time, money, pricing, availability
    db/                 Drizzle schema and the connection pool
    auth/               sessions, passwords, permissions, route protection
    payments/           payment adapters
    notifications/      templates, delivery adapters, calendar invites
    content/            CMS reads with labelled sample fallbacks
  server/               server-only services
  proxy.ts              what earlier Next.js versions called middleware
drizzle/migrations/     hand-written SQL — authoritative
sanity/                 Studio schemas and structure
tests/                  unit and integration tests
```

`drizzle/migrations/*.sql` is the authoritative schema, not `src/lib/db/schema.ts`. The
guarantees that matter most — the GiST exclusion constraint, partial unique indexes over
expressions, `btree_gist` — are not all expressible through the query builder, so
migrations are written by hand and the Drizzle schema exists to type queries against them.

Route groups (`(public)`, `(protected)`) do not appear in URLs. They exist so the staff
dashboard does not inherit the marketing header and footer, and so `/admin/sign-in` sits
outside the layout that demands a session.

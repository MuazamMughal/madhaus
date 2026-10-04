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
| `npm run db:verify` | Check a connection string can run this app (see *Managed Postgres*) |
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

### Rendering

Most public pages are prerendered and served from the CDN: they show configuration — sports,
prices, hours, menu, editorial — which changes when staff change it, not per visitor. Sanity
publishes push a tag revalidation, so edits appear without a rebuild.

Two things are **never** prerendered, and the distinction matters:

| | Why |
|---|---|
| `/book`, `/booking/[reference]`, `/account`, all of `/admin` | Per-visitor or live by definition |
| `/arena/[sport]` | Shows tonight's remaining slots. Prerendered, those would freeze at build time and the CDN would keep serving them for days — telling a customer a court is free that was booked last week |

A stale availability claim is worse than no claim, so any page that shows one is dynamic.
The consequence is that **the build reads the database**: an unmigrated or unreachable
Postgres fails the build rather than degrading at runtime.

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

109 tests across 10 files. Integration tests run against a real Postgres, because what they prove — the
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
- **Content:** an incomplete Sanity link resolves to `null` rather than a half-built `href`;
  webhook signatures are rejected when forged, stale or unsigned.
- **Time:** the trading night runs from one 05:00 rollover to the next, so a 17:00 opener
  and a 02:40 session count against the same night.
- **Units:** phone normalisation, money arithmetic, the timezone model, pricing bands,
  route protection.

If the suite was interrupted partway it can leave the seeded config incomplete. It detects
this and tells you to run `npm run db:seed` rather than failing in thirty confusing places.

---

## Deployment

**Order matters.** The build prerenders pages that read the database (see
*[Rendering](#rendering)*), so a database that is unreachable or has no schema fails the
build rather than the first request. Migrate and seed *before* the first deploy.

1. **Database.** Managed Postgres 17+ with the `btree_gist` and `pgcrypto` extensions, both
   in contrib. Run `npm run db:verify`, then `npm run db:migrate`, then `npm run db:seed`.
   See *[Managed Postgres](#managed-postgres)* below.
2. **Environment.** Everything in `.env.example`. `SESSION_SECRET` and `CRON_SECRET` must
   be freshly generated. Do not carry `.env.development.local` across.

   Two traps worth stating plainly, because neither fails the build:

   - **`.env.example` holds placeholders, not defaults.** Its `DATABASE_URL` is
     `localhost:5433`. Copying that file wholesale into a host's environment variables
     produces a build that tries to reach a database on the build machine.
   - **`NEXT_PUBLIC_SITE_URL` defaults to `http://localhost:3000`.** Leave it unset and the
     site deploys perfectly, then every link in every customer email — confirmations, the
     `.ics` attachment, the JazzCash payment link — points at localhost. There is no error
     anywhere. Set it to the real domain before sending a single booking.
3. **Email.** `RESEND_API_KEY`, `EMAIL_FROM`, `VENUE_NOTIFICATION_EMAIL`,
   `NOTIFICATION_CHANNELS=email`. **The booking flow runs on this** — without it the venue
   is never told a request came in.
4. **JazzCash.** `JAZZCASH_ACCOUNT_TITLE` and `JAZZCASH_ACCOUNT_NUMBER`. Leave blank and
   online payment is simply not offered.
5. **Build.** `npm run build && npm start`.
6. **Scheduled jobs.** Point a scheduler at `POST /api/cron/run` every minute or two with
   `Authorization: Bearer $CRON_SECRET`. It delivers queued email, releases undecided
   requests, and prunes sessions.
7. **Sanity.** Create a project and set `NEXT_PUBLIC_SANITY_*`. Then add a webhook at
   sanity.io/manage pointing at `https://<your-domain>/api/revalidate`, signed with
   `SANITY_REVALIDATE_SECRET`, so published edits appear immediately.
   *Do not add this webhook while developing locally* — Sanity cannot reach `localhost`,
   and development already reads uncached, so edits are instant without it.
8. **Seed the first owner**, then change the password immediately.

Read **[`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md)** before going public — some
integrations are deliberately not wired up, and the site says so rather than pretending.

---

### Managed Postgres

The booking system rests on one database feature: a GiST exclusion constraint on
`reservations` that makes a double-booking impossible to insert. Before trusting a new
database with it, prove it:

```bash
npm run db:verify                      # checks DATABASE_URL
npm run db:verify -- "postgres://..."  # checks a specific connection string
```

That connects, confirms `btree_gist` and `pgcrypto` are installable, **builds a real
exclusion constraint and tries to double-book it**, and exercises the advisory locks and
`FOR UPDATE SKIP LOCKED` the booking path and the sweeper depend on. It touches nothing
but a temporary table inside a rolled-back transaction, so it is safe against a live
database.

#### Neon

Neon gives two hostnames for the same database. Both are in the console under **Connection
Details**; the **Connection pooling** toggle switches between them.

| | Host | Use it for |
|---|---|---|
| Pooled | `ep-xxx-pooler.region.aws.neon.tech` | `DATABASE_URL` for the running app |
| Direct | `ep-xxx.region.aws.neon.tech` | `npm run db:migrate` |

Use the **pooled** host for the app: serverless functions open connections faster than a
Postgres instance can accept them, and the pooler absorbs that. Run migrations through the
**direct** host, because DDL and transaction pooling do not mix well.

Copy the string from the console — it already carries the password and `?sslmode=require`,
which `pgSslOptions()` in `src/lib/db/ssl.ts` keys off to enable TLS. Then:

```bash
npm run db:verify && npm run db:migrate && npm run db:seed
```

Two things to expect. The first query after an idle period takes a few seconds while the
compute resumes — `db:verify` labels that *cold start* rather than letting it look like a
fault. And `ALTER ROLE ... SET TimeZone` in migration 0006 may be refused; that is
harmless, because no query depends on the session time zone, and `db:verify` reports the
live value either way.

#### Vercel

Set the environment variables under **Settings → Environment Variables**, scoped to
Production, Preview and Development. `DATABASE_URL` there is the **pooled** host: a
serverless platform opens connections faster than a Postgres instance accepts them, and the
pooler absorbs that. Migrations are run from a developer machine against the **direct**
host, not from the build.

An inline variable overrides `.env.local`, because dotenv does not replace values already in
the environment. So a one-off command against production is safe and does not touch the
local database:

```bash
DATABASE_URL="<direct host>" npm run db:migrate
```

Seeding needs `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` in the same command. Without
them the seed prints *"no owner account created"* and continues, leaving a database nobody
can sign in to.

Scheduled jobs are a Vercel Cron entry pointing at `POST /api/cron/run`; see
*[Scheduled jobs](docs/INTEGRATIONS.md)* for the authorization header.

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
    sanity/             client, link resolution, webhook verification
  server/               server-only services
  proxy.ts              what earlier Next.js versions called middleware
drizzle/migrations/     hand-written SQL — authoritative
sanity/                 Studio schemas and structure
scripts/                migrate, seed, db-check, and local development helpers
tests/                  unit and integration tests
```

`drizzle/migrations/*.sql` is the authoritative schema, not `src/lib/db/schema.ts`. The
guarantees that matter most — the GiST exclusion constraint, partial unique indexes over
expressions, `btree_gist` — are not all expressible through the query builder, so
migrations are written by hand and the Drizzle schema exists to type queries against them.

Route groups (`(public)`, `(protected)`) do not appear in URLs. They exist so the staff
dashboard does not inherit the marketing header and footer, and so `/admin/sign-in` sits
outside the layout that demands a session.

-- MadHaus :: initial schema
-- Transactional store. Public/editorial content lives in Sanity, never here.
--
-- The single most important object in this file is `reservations.reservations_no_overlap`.
-- Every kind of occupancy -- customer bookings, checkout holds, staff walk-ins, maintenance
-- blocks and event reservations -- is written as a row in ONE table, so a single Postgres
-- exclusion constraint makes double-booking physically impossible, no matter which code path
-- (or hand-written SQL) tries it.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE resource_kind AS ENUM ('padel', 'multipurpose');

CREATE TYPE reservation_kind AS ENUM ('booking', 'hold', 'maintenance', 'event');

-- Booking lifecycle. Deliberately separate from payment lifecycle: a booking can be
-- confirmed and unpaid (pay at venue), or cancelled after being paid (refund pending).
CREATE TYPE booking_status AS ENUM (
  'held',             -- checkout hold, not yet a reservation the customer can rely on
  'pending_approval', -- request submitted, awaiting staff decision
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

CREATE TYPE payment_status AS ENUM (
  'unpaid',
  'pending_verification', -- e.g. bank transfer receipt uploaded, staff has not checked it
  'paid',
  'failed',
  'partially_refunded',
  'refunded'
);

CREATE TYPE booking_source AS ENUM ('online', 'staff_walkin', 'staff_phone', 'event');

CREATE TYPE staff_role AS ENUM ('owner', 'arena_manager', 'cafe_manager', 'content_editor', 'reception');

CREATE TYPE cafe_request_status AS ENUM ('requested', 'confirmed', 'rejected', 'cancelled', 'seated', 'completed', 'no_show');

CREATE TYPE cafe_order_status AS ENUM ('pending', 'accepted', 'preparing', 'ready', 'fulfilled', 'rejected', 'cancelled');

CREATE TYPE cafe_order_type AS ENUM ('pickup', 'court_addon');

CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'whatsapp');

CREATE TYPE notification_status AS ENUM ('queued', 'sending', 'sent', 'failed', 'dead');

CREATE TYPE payment_intent_status AS ENUM ('created', 'awaiting_action', 'awaiting_verification', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded');

-- ---------------------------------------------------------------------------
-- Settings / feature flags
-- ---------------------------------------------------------------------------

-- Server-authoritative switches. Anything half-built stays off, so it cannot appear publicly.
CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Physical resources and the sports played on them
-- ---------------------------------------------------------------------------

-- A resource is a PHYSICAL thing that can only be used by one party at a time.
-- MadHaus has two: the padel court, and the shared multipurpose court.
CREATE TABLE resources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  kind               resource_kind NOT NULL,
  -- Minutes the court is unavailable after any booking ends, for clean-up/changeover.
  -- Applied uniformly, so back-to-back slots are offered on a predictable grid.
  turnaround_minutes integer NOT NULL DEFAULT 0 CHECK (turnaround_minutes BETWEEN 0 AND 240),
  -- Extra minutes required when the ADJACENT booking is a different sport (nets down,
  -- goals out, line re-marking). Enforced in the booking transaction under an advisory lock.
  sport_change_buffer_minutes integer NOT NULL DEFAULT 0 CHECK (sport_change_buffer_minutes BETWEEN 0 AND 240),
  is_active          boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 0
);

-- A sport is a way of USING a resource. Football and cricket both point at the
-- multipurpose court, which is what makes them mutually exclusive: the overlap
-- constraint keys on resource_id, so it does not care which sport was booked.
CREATE TABLE sports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,
  name                text NOT NULL,
  resource_id         uuid NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  allowed_durations   integer[] NOT NULL DEFAULT '{60,90,120}',
  default_duration    integer NOT NULL DEFAULT 60,
  slot_step_minutes   integer NOT NULL DEFAULT 30 CHECK (slot_step_minutes BETWEEN 5 AND 240),
  min_players         integer,
  max_players         integer,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  CONSTRAINT sports_default_duration_allowed CHECK (default_duration = ANY (allowed_durations))
);

CREATE INDEX sports_resource_idx ON sports (resource_id);

-- ---------------------------------------------------------------------------
-- Operating schedule
-- ---------------------------------------------------------------------------

-- Stored as venue-local wall-clock time (Asia/Karachi). MadHaus runs 17:00 -> 03:00,
-- so closes_next_day is the normal case here, not an edge case.
CREATE TABLE operating_hours (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 0 = Sunday .. 6 = Saturday, matching Postgres EXTRACT(DOW).
  day_of_week     integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at        time NOT NULL,
  closes_at       time NOT NULL,
  closes_next_day boolean NOT NULL DEFAULT false,
  is_closed       boolean NOT NULL DEFAULT false,
  UNIQUE (day_of_week)
);

-- Venue-wide closures (public holidays, private hire of the whole site).
CREATE TABLE blackout_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  -- NULL = the whole venue. Otherwise scoped to one resource.
  resource_id uuid REFERENCES resources(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blackout_range_valid CHECK (ends_at > starts_at)
);

CREATE INDEX blackout_periods_window_idx ON blackout_periods (starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------

-- All money is integer MINOR units (paisa) to keep arithmetic exact.
-- Rates are per hour; the engine pro-rates by duration.
CREATE TABLE pricing_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label               text NOT NULL,
  sport_id            uuid REFERENCES sports(id) ON DELETE CASCADE,     -- NULL = any sport
  resource_id         uuid REFERENCES resources(id) ON DELETE CASCADE,  -- NULL = any resource
  -- Which weekdays this rule covers, as DOW integers. Empty = all days.
  days_of_week        integer[] NOT NULL DEFAULT '{}',
  -- Venue-local window the rule applies to. May wrap past midnight (e.g. 22:00 -> 03:00).
  starts_at_local     time NOT NULL DEFAULT '00:00',
  ends_at_local       time NOT NULL DEFAULT '23:59:59',
  rate_minor_per_hour integer NOT NULL CHECK (rate_minor_per_hour >= 0),
  is_peak             boolean NOT NULL DEFAULT false,
  -- Higher priority wins when several rules match the same minute.
  priority            integer NOT NULL DEFAULT 0,
  valid_from          date,
  valid_to            date,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pricing_rules_lookup_idx ON pricing_rules (sport_id, is_active, priority DESC);

CREATE TABLE coupons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE,
  label              text NOT NULL,
  -- 'percent' takes discount_bps, 'fixed' takes discount_minor.
  kind               text NOT NULL CHECK (kind IN ('percent', 'fixed')),
  discount_bps       integer CHECK (discount_bps BETWEEN 0 AND 10000),
  discount_minor     integer CHECK (discount_minor >= 0),
  min_subtotal_minor integer NOT NULL DEFAULT 0,
  -- Eligibility. Empty array = applies to everything.
  sport_ids          uuid[] NOT NULL DEFAULT '{}',
  max_redemptions    integer,
  max_per_customer   integer NOT NULL DEFAULT 1,
  -- Counter kept in step with coupon_redemptions inside the booking transaction.
  redemption_count   integer NOT NULL DEFAULT 0,
  valid_from         timestamptz,
  valid_to           timestamptz,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_amount_matches_kind CHECK (
    (kind = 'percent' AND discount_bps IS NOT NULL) OR
    (kind = 'fixed'   AND discount_minor IS NOT NULL)
  ),
  CONSTRAINT coupons_redemption_cap CHECK (max_redemptions IS NULL OR redemption_count <= max_redemptions)
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- E.164, normalised on the way in (+92...). The natural key for a Pakistani venue.
  phone         text NOT NULL UNIQUE,
  email         text,
  name          text NOT NULL,
  -- NULL for guest-booking customers who never set a password.
  password_hash text,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX customers_email_key ON customers (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE staff_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          staff_role NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX staff_users_email_key ON staff_users (lower(email));

-- Opaque server-side sessions. Only the hash is stored, so a database leak does not
-- hand out live sessions.
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  actor_type  text NOT NULL CHECK (actor_type IN ('customer', 'staff')),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  staff_id    uuid REFERENCES staff_users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_actor_matches CHECK (
    (actor_type = 'customer' AND customer_id IS NOT NULL AND staff_id IS NULL) OR
    (actor_type = 'staff'    AND staff_id    IS NOT NULL AND customer_id IS NULL)
  )
);

CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Maintenance and events (both occupy courts, so both feed `reservations`)
-- ---------------------------------------------------------------------------

CREATE TABLE maintenance_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id   uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  reason        text NOT NULL,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  created_by    uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_range_valid CHECK (ends_at > starts_at)
);

-- Operational mirror of a Sanity event document. Sanity owns the words and pictures;
-- this table owns capacity and the court it takes over, because those must be transactional.
CREATE TABLE events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches the Sanity document slug, so marketing content and operations line up.
  slug                text NOT NULL UNIQUE,
  title               text NOT NULL,
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  resource_id         uuid REFERENCES resources(id) ON DELETE SET NULL,
  registration_enabled boolean NOT NULL DEFAULT false,
  capacity            integer CHECK (capacity IS NULL OR capacity > 0),
  registered_count    integer NOT NULL DEFAULT 0 CHECK (registered_count >= 0),
  price_minor         integer NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  is_published        boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_range_valid CHECK (ends_at > starts_at),
  CONSTRAINT events_capacity_not_exceeded CHECK (capacity IS NULL OR registered_count <= capacity)
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

CREATE TABLE bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-quotable, Crockford base32, no vowels and no look-alike characters: MH-7F3K2Q9X.
  -- Short enough to read over the phone, wide enough that guessing is useless.
  reference           text NOT NULL UNIQUE,
  -- The reference alone is NOT enough to open a booking. /booking/[reference] also needs a
  -- token, delivered in the confirmation link; only its hash is stored.
  access_token_hash   text NOT NULL,

  sport_id            uuid NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
  resource_id         uuid NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,

  -- The window the customer actually plays. Always UTC; rendered in Asia/Karachi.
  -- The blocking window (play time + turnaround) lives on `reservations.during`.
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  duration_minutes    integer NOT NULL CHECK (duration_minutes > 0),

  status              booking_status NOT NULL DEFAULT 'held',
  payment_status      payment_status NOT NULL DEFAULT 'unpaid',

  customer_id         uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       text NOT NULL,
  customer_phone      text NOT NULL,
  customer_email      text,
  party_size          integer CHECK (party_size IS NULL OR party_size > 0),
  notes               text,

  source              booking_source NOT NULL DEFAULT 'online',
  created_by_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,

  currency            text NOT NULL DEFAULT 'PKR',
  subtotal_minor      integer NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  discount_minor      integer NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor         integer NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  amount_paid_minor   integer NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  amount_refunded_minor integer NOT NULL DEFAULT 0 CHECK (amount_refunded_minor >= 0),
  -- Frozen at creation: the rate bands used, the add-on lines, the coupon applied.
  -- Prices may change tomorrow; what this customer agreed to must not.
  pricing_snapshot    jsonb NOT NULL DEFAULT '{}',
  -- Frozen cancellation/reschedule terms, so the policy is judged as it was when booked.
  policy_snapshot     jsonb NOT NULL DEFAULT '{}',
  coupon_code         text,

  payment_method      text,
  -- Only meaningful while status = 'held'.
  hold_expires_at     timestamptz,

  checked_in_at       timestamptz,
  cancelled_at        timestamptz,
  cancelled_by        text CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'staff', 'system')),
  cancellation_reason text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookings_range_valid CHECK (ends_at > starts_at),
  CONSTRAINT bookings_total_is_net CHECK (total_minor = GREATEST(subtotal_minor - discount_minor, 0)),
  CONSTRAINT bookings_discount_within_subtotal CHECK (discount_minor <= subtotal_minor),
  CONSTRAINT bookings_refund_within_paid CHECK (amount_refunded_minor <= amount_paid_minor),
  CONSTRAINT bookings_hold_has_expiry CHECK (status <> 'held' OR hold_expires_at IS NOT NULL)
);

CREATE INDEX bookings_starts_at_idx      ON bookings (starts_at);
CREATE INDEX bookings_resource_day_idx   ON bookings (resource_id, starts_at);
CREATE INDEX bookings_customer_idx       ON bookings (customer_id, starts_at DESC);
CREATE INDEX bookings_phone_idx          ON bookings (customer_phone);
CREATE INDEX bookings_status_idx         ON bookings (status, starts_at);
CREATE INDEX bookings_hold_expiry_idx    ON bookings (hold_expires_at) WHERE status = 'held';

-- ---------------------------------------------------------------------------
-- reservations :: the one true occupancy table
-- ---------------------------------------------------------------------------

CREATE TABLE reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id         uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  -- Recorded so the sport-change buffer check can see what the neighbour was playing.
  -- NULL for maintenance.
  sport_id            uuid REFERENCES sports(id) ON DELETE SET NULL,
  kind                reservation_kind NOT NULL,

  -- Half-open [start, end): 18:00-19:00 and 19:00-20:00 do NOT overlap, so
  -- back-to-back bookings are allowed, which is what a court operator wants.
  -- This is the BLOCKING window: play time plus the resource's turnaround.
  during              tstzrange NOT NULL,

  -- The exclusion constraint below only looks at rows where this is true. Cancelling a
  -- booking or releasing a hold flips it to false rather than deleting history.
  blocks_availability boolean NOT NULL DEFAULT true,

  -- Holds only. An expired hold still satisfies the constraint until it is swept, so
  -- every availability read and every write path sweeps first. See sweepExpiredHolds().
  expires_at          timestamptz,

  booking_id          uuid REFERENCES bookings(id) ON DELETE CASCADE,
  maintenance_id      uuid REFERENCES maintenance_blocks(id) ON DELETE CASCADE,
  event_id            uuid REFERENCES events(id) ON DELETE CASCADE,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservations_during_bounded CHECK (
    NOT isempty(during) AND lower(during) IS NOT NULL AND upper(during) IS NOT NULL
  ),
  CONSTRAINT reservations_owner_matches_kind CHECK (
    (kind IN ('booking', 'hold') AND booking_id IS NOT NULL AND maintenance_id IS NULL AND event_id IS NULL) OR
    (kind = 'maintenance'        AND maintenance_id IS NOT NULL AND booking_id IS NULL AND event_id IS NULL) OR
    (kind = 'event'              AND event_id IS NOT NULL AND booking_id IS NULL AND maintenance_id IS NULL)
  ),
  CONSTRAINT reservations_hold_has_expiry CHECK (kind <> 'hold' OR expires_at IS NOT NULL),

  -- THE invariant. Two blocking reservations can never overlap on the same physical
  -- resource. Because football and cricket share one resource_id, this is also what
  -- stops a football booking from being taken while cricket has the court.
  CONSTRAINT reservations_no_overlap
    EXCLUDE USING gist (resource_id WITH =, during WITH &&)
    WHERE (blocks_availability)
);

CREATE INDEX reservations_lookup_idx ON reservations USING gist (resource_id, during)
  WHERE blocks_availability;
CREATE INDEX reservations_booking_idx ON reservations (booking_id);
CREATE INDEX reservations_hold_sweep_idx ON reservations (expires_at)
  WHERE kind = 'hold' AND blocks_availability;

-- One live blocking reservation per booking. Prevents a retry or a buggy webhook from
-- attaching a second court block to the same booking.
CREATE UNIQUE INDEX reservations_one_active_per_booking
  ON reservations (booking_id) WHERE blocks_availability AND booking_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Add-ons (equipment hire, and café items sold against a court booking)
-- ---------------------------------------------------------------------------

CREATE TABLE addons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  name           text NOT NULL,
  description    text,
  kind           text NOT NULL CHECK (kind IN ('equipment', 'cafe')),
  price_minor    integer NOT NULL CHECK (price_minor >= 0),
  -- Empty = offered with every sport.
  sport_ids      uuid[] NOT NULL DEFAULT '{}',
  -- NULL = unlimited. Otherwise decremented/checked when a booking claims it.
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  max_per_booking integer NOT NULL DEFAULT 10 CHECK (max_per_booking > 0),
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0
);

CREATE TABLE booking_addons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  addon_id     uuid REFERENCES addons(id) ON DELETE SET NULL,
  -- Snapshotted, so the line still reads correctly after the add-on is renamed or repriced.
  name         text NOT NULL,
  unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
  quantity     integer NOT NULL CHECK (quantity > 0),
  line_total_minor integer NOT NULL CHECK (line_total_minor >= 0),
  CONSTRAINT booking_addons_line_total_correct CHECK (line_total_minor = unit_price_minor * quantity)
);

CREATE INDEX booking_addons_booking_idx ON booking_addons (booking_id);

-- ---------------------------------------------------------------------------
-- Café
-- ---------------------------------------------------------------------------

-- Operational mirror of Sanity menu items. Sanity owns name, picture and description;
-- this owns "can I actually sell it right now" and the price the server charges.
CREATE TABLE menu_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  category      text NOT NULL,
  base_price_minor integer NOT NULL CHECK (base_price_minor >= 0),
  is_available  boolean NOT NULL DEFAULT true,
  is_orderable  boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0
);

CREATE TABLE menu_item_variants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name          text NOT NULL,
  -- Added to (or subtracted from) the item's base price.
  price_delta_minor integer NOT NULL DEFAULT 0,
  is_available  boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0
);

CREATE INDEX menu_item_variants_item_idx ON menu_item_variants (menu_item_id);

CREATE TABLE menu_item_modifiers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name          text NOT NULL,
  price_minor   integer NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  is_available  boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0
);

CREATE INDEX menu_item_modifiers_item_idx ON menu_item_modifiers (menu_item_id);

-- Physical tables, only used when instant confirmation is switched on: you cannot
-- honestly confirm a reservation instantly without knowing real capacity.
CREATE TABLE cafe_tables (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text NOT NULL UNIQUE,
  seats      integer NOT NULL CHECK (seats > 0),
  is_active  boolean NOT NULL DEFAULT true
);

CREATE TABLE cafe_reservations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference    text NOT NULL UNIQUE,
  access_token_hash text NOT NULL,
  customer_id  uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  party_size   integer NOT NULL CHECK (party_size > 0),
  starts_at    timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 90 CHECK (duration_minutes > 0),
  status       cafe_request_status NOT NULL DEFAULT 'requested',
  table_id     uuid REFERENCES cafe_tables(id) ON DELETE SET NULL,
  notes        text,
  -- true when the venue is running in instant-confirm mode; false = staff must decide.
  auto_confirmed boolean NOT NULL DEFAULT false,
  staff_note   text,
  decided_by   uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cafe_reservations_day_idx ON cafe_reservations (starts_at);
CREATE INDEX cafe_reservations_status_idx ON cafe_reservations (status, starts_at);

-- A table cannot be double-allocated once it has actually been assigned.
CREATE TABLE cafe_table_allocations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    uuid NOT NULL REFERENCES cafe_tables(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES cafe_reservations(id) ON DELETE CASCADE,
  during      tstzrange NOT NULL,
  CONSTRAINT cafe_table_no_overlap
    EXCLUDE USING gist (table_id WITH =, during WITH &&)
);

CREATE TABLE cafe_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE,
  access_token_hash text NOT NULL,
  order_type    cafe_order_type NOT NULL,
  status        cafe_order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  -- Set for court_addon orders: which booking the food belongs to, so staff know
  -- where to carry it and when.
  booking_id    uuid REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id   uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  -- When the customer collects (pickup) or when it should reach the court (court_addon).
  fulfil_at     timestamptz NOT NULL,
  fulfil_location text NOT NULL DEFAULT 'counter',
  notes         text,
  currency      text NOT NULL DEFAULT 'PKR',
  subtotal_minor integer NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  total_minor   integer NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  amount_paid_minor integer NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  payment_method text,
  rejected_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cafe_orders_addon_needs_booking CHECK (order_type <> 'court_addon' OR booking_id IS NOT NULL)
);

CREATE INDEX cafe_orders_queue_idx ON cafe_orders (status, fulfil_at);
CREATE INDEX cafe_orders_booking_idx ON cafe_orders (booking_id);

CREATE TABLE cafe_order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES cafe_orders(id) ON DELETE CASCADE,
  menu_item_id  uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  -- Name, variant and modifier text are snapshotted: a receipt must still make sense
  -- after the kitchen renames the dish.
  item_name     text NOT NULL,
  variant_name  text,
  modifiers     jsonb NOT NULL DEFAULT '[]',
  unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
  quantity      integer NOT NULL CHECK (quantity > 0),
  line_total_minor integer NOT NULL CHECK (line_total_minor >= 0),
  notes         text
);

CREATE INDEX cafe_order_items_order_idx ON cafe_order_items (order_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

-- One row per attempt to collect money. Adapter-shaped: `provider` names the adapter
-- ('pay_at_venue', 'bank_transfer', 'simulator', or a real gateway once verified).
CREATE TABLE payment_intents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL,
  status          payment_intent_status NOT NULL DEFAULT 'created',
  -- Exactly one of these is set.
  booking_id      uuid REFERENCES bookings(id) ON DELETE CASCADE,
  cafe_order_id   uuid REFERENCES cafe_orders(id) ON DELETE CASCADE,
  event_registration_id uuid,

  currency        text NOT NULL DEFAULT 'PKR',
  -- The amount the SERVER decided. Webhooks are checked against this, never the reverse.
  amount_minor    integer NOT NULL CHECK (amount_minor >= 0),
  amount_captured_minor integer NOT NULL DEFAULT 0 CHECK (amount_captured_minor >= 0),
  amount_refunded_minor integer NOT NULL DEFAULT 0 CHECK (amount_refunded_minor >= 0),

  provider_reference text,
  -- Sent to the provider so a retry cannot create a second charge.
  idempotency_key text NOT NULL UNIQUE,
  -- Manual bank transfer: what the customer uploaded, and who checked it.
  receipt_url     text,
  receipt_note    text,
  verified_by     uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  verified_at     timestamptz,
  failure_reason  text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payment_intents_one_subject CHECK (
    (booking_id IS NOT NULL)::int + (cafe_order_id IS NOT NULL)::int + (event_registration_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT payment_intents_captured_within_amount CHECK (amount_captured_minor <= amount_minor),
  CONSTRAINT payment_intents_refund_within_captured CHECK (amount_refunded_minor <= amount_captured_minor)
);

CREATE INDEX payment_intents_booking_idx ON payment_intents (booking_id);
CREATE INDEX payment_intents_provider_ref_idx ON payment_intents (provider, provider_reference);

-- Every inbound webhook lands here FIRST, keyed on the provider's own event id.
-- The unique constraint is the idempotency mechanism: a replayed event cannot be
-- processed twice, so a duplicate callback cannot produce a duplicate confirmation.
CREATE TABLE payment_webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL,
  provider_event_id text NOT NULL,
  event_type        text NOT NULL,
  payload           jsonb NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  processed_at      timestamptz,
  -- Set when the event was valid but deliberately not acted on, e.g. it arrived after
  -- the hold expired and the court had already gone to someone else.
  outcome           text,
  received_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX payment_webhook_events_unprocessed_idx ON payment_webhook_events (received_at)
  WHERE processed_at IS NULL;

CREATE TABLE refunds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  amount_minor    integer NOT NULL CHECK (amount_minor > 0),
  reason          text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  provider_reference text,
  requested_by    uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  settled_at      timestamptz
);

CREATE INDEX refunds_intent_idx ON refunds (payment_intent_id);

-- ---------------------------------------------------------------------------
-- Events: registrations
-- ---------------------------------------------------------------------------

CREATE TABLE event_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE,
  access_token_hash text NOT NULL,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  party_size    integer NOT NULL DEFAULT 1 CHECK (party_size > 0),
  status        text NOT NULL DEFAULT 'registered'
                CHECK (status IN ('registered', 'waitlisted', 'cancelled', 'attended', 'no_show')),
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  total_minor   integer NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_registrations_event_idx ON event_registrations (event_id, status);
-- One live registration per phone per event.
CREATE UNIQUE INDEX event_registrations_one_per_phone
  ON event_registrations (event_id, customer_phone) WHERE status <> 'cancelled';

ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_event_registration_fk
  FOREIGN KEY (event_registration_id) REFERENCES event_registrations(id) ON DELETE CASCADE;

CREATE TABLE coupon_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id   uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES bookings(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  discount_minor integer NOT NULL CHECK (discount_minor >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coupon_redemptions_coupon_idx ON coupon_redemptions (coupon_id);
-- A coupon cannot be redeemed twice against the same booking.
CREATE UNIQUE INDEX coupon_redemptions_once_per_booking
  ON coupon_redemptions (coupon_id, booking_id) WHERE booking_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Notifications :: durable outbox
-- ---------------------------------------------------------------------------

-- Messages are written inside the same transaction as the booking, then delivered by a
-- worker. A provider outage therefore delays a message; it can never lose a booking.
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       notification_channel NOT NULL,
  template      text NOT NULL,
  recipient     text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  status        notification_status NOT NULL DEFAULT 'queued',
  -- Unique, so retrying the same logical message never sends twice.
  dedupe_key    text NOT NULL UNIQUE,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error    text,
  -- Transactional messages always send. Marketing obeys the opt-in flag.
  is_marketing  boolean NOT NULL DEFAULT false,
  booking_id    uuid REFERENCES bookings(id) ON DELETE CASCADE,
  cafe_order_id uuid REFERENCES cafe_orders(id) ON DELETE CASCADE,
  cafe_reservation_id uuid REFERENCES cafe_reservations(id) ON DELETE CASCADE,
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_due_idx ON notifications (next_attempt_at)
  WHERE status IN ('queued', 'failed');
CREATE INDEX notifications_booking_idx ON notifications (booking_id, created_at);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_type  text NOT NULL CHECK (actor_type IN ('customer', 'staff', 'system', 'webhook')),
  actor_id    uuid,
  actor_label text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  -- Before/after, already redacted of anything sensitive by the caller.
  diff        jsonb NOT NULL DEFAULT '{}',
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_type, actor_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Rate limiting (simple, durable, good enough without Redis)
-- ---------------------------------------------------------------------------

CREATE TABLE rate_limit_buckets (
  key           text PRIMARY KEY,
  tokens        integer NOT NULL,
  window_start  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_touch        BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER customers_touch       BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER cafe_orders_touch     BEFORE UPDATE ON cafe_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER cafe_reservations_touch BEFORE UPDATE ON cafe_reservations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER payment_intents_touch BEFORE UPDATE ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER settings_touch        BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

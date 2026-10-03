import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Drizzle schema.
 *
 * `drizzle/migrations/*.sql` is the authoritative definition, not this file. Postgres
 * exclusion constraints, partial unique indexes over expressions and GiST operator
 * classes are the backbone of this schema's correctness and are not all expressible in
 * the builder, so migrations are written by hand and this file exists to type queries
 * against them. `npm run db:check` diffs the two so they cannot drift silently.
 */

// --- Custom types ------------------------------------------------------------------

/**
 * `tstzrange`. Always written with half-open `[)` bounds, so touching intervals do not
 * overlap and back-to-back bookings are legal.
 */
const tstzrange = customType<{ data: { start: Date; end: Date }; driverData: string }>({
  dataType() {
    return "tstzrange";
  },
  toDriver(value) {
    return `[${value.start.toISOString()},${value.end.toISOString()})`;
  },
  fromDriver(value) {
    const match = /^[[(]"?([^",]+)"?,"?([^",)]+)"?[)\]]$/.exec(value);
    if (!match) throw new Error(`Could not parse tstzrange: ${value}`);
    return { start: new Date(match[1]), end: new Date(match[2]) };
  },
});

/** `integer[]`, used for allowed durations and day-of-week masks. */
const integerArray = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "integer[]";
  },
  toDriver(value) {
    return `{${value.join(",")}}`;
  },
  fromDriver(value) {
    const inner = value.slice(1, -1);
    return inner === "" ? [] : inner.split(",").map((entry) => Number.parseInt(entry, 10));
  },
});

const uuidArray = customType<{ data: string[]; driverData: string }>({
  dataType() {
    return "uuid[]";
  },
  toDriver(value) {
    return `{${value.join(",")}}`;
  },
  fromDriver(value) {
    const inner = value.slice(1, -1);
    return inner === "" ? [] : inner.split(",").map((entry) => entry.replace(/"/g, ""));
  },
});

// --- Enums -------------------------------------------------------------------------

export const resourceKind = pgEnum("resource_kind", ["padel", "multipurpose"]);

export const reservationKind = pgEnum("reservation_kind", [
  "booking",
  "hold",
  /** A booking a customer has asked for, awaiting a staff decision. Holds the court. */
  "request",
  "maintenance",
  "event",
]);

export const bookingStatus = pgEnum("booking_status", [
  "held",
  "pending_approval",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);

export const paymentStatus = pgEnum("payment_status", [
  "unpaid",
  "pending_verification",
  "paid",
  "failed",
  "partially_refunded",
  "refunded",
]);

export const bookingSource = pgEnum("booking_source", [
  "online",
  "staff_walkin",
  "staff_phone",
  "event",
]);

export const staffRole = pgEnum("staff_role", [
  "owner",
  "arena_manager",
  "cafe_manager",
  "content_editor",
  "reception",
]);

export const cafeRequestStatus = pgEnum("cafe_request_status", [
  "requested",
  "confirmed",
  "rejected",
  "cancelled",
  "seated",
  "completed",
  "no_show",
]);

export const cafeOrderStatus = pgEnum("cafe_order_status", [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "fulfilled",
  "rejected",
  "cancelled",
]);

export const cafeOrderType = pgEnum("cafe_order_type", ["pickup", "court_addon"]);

export const notificationChannel = pgEnum("notification_channel", ["email", "sms", "whatsapp"]);

export const notificationStatus = pgEnum("notification_status", [
  "queued",
  "sending",
  "sent",
  "failed",
  "dead",
]);

export const paymentIntentStatus = pgEnum("payment_intent_status", [
  "created",
  "awaiting_action",
  "awaiting_verification",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
]);

// --- Settings ----------------------------------------------------------------------

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Resources and sports ----------------------------------------------------------

export const resources = pgTable("resources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: resourceKind("kind").notNull(),
  turnaroundMinutes: integer("turnaround_minutes").notNull().default(0),
  sportChangeBufferMinutes: integer("sport_change_buffer_minutes").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sports = pgTable(
  "sports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "restrict" }),
    allowedDurations: integerArray("allowed_durations").notNull().default([60, 90, 120]),
    defaultDuration: integer("default_duration").notNull().default(60),
    slotStepMinutes: integer("slot_step_minutes").notNull().default(30),
    minPlayers: integer("min_players"),
    maxPlayers: integer("max_players"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("sports_resource_idx").on(table.resourceId)],
);

// --- Schedule ----------------------------------------------------------------------

export const operatingHours = pgTable("operating_hours", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  /** 0 = Sunday, matching Postgres EXTRACT(DOW). */
  dayOfWeek: integer("day_of_week").notNull().unique(),
  opensAt: time("opens_at").notNull(),
  closesAt: time("closes_at").notNull(),
  /** True at MadHaus: the venue trades 17:00 to 03:00. */
  closesNextDay: boolean("closes_next_day").notNull().default(false),
  isClosed: boolean("is_closed").notNull().default(false),
});

export const blackoutPeriods = pgTable(
  "blackout_periods",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    label: text("label").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** null = the whole venue. */
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("blackout_periods_window_idx").on(table.startsAt, table.endsAt)],
);

// --- Pricing -----------------------------------------------------------------------

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    label: text("label").notNull(),
    sportId: uuid("sport_id").references(() => sports.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "cascade" }),
    daysOfWeek: integerArray("days_of_week").notNull().default([]),
    startsAtLocal: time("starts_at_local").notNull().default("00:00"),
    endsAtLocal: time("ends_at_local").notNull().default("23:59:59"),
    rateMinorPerHour: integer("rate_minor_per_hour").notNull(),
    isPeak: boolean("is_peak").notNull().default(false),
    priority: integer("priority").notNull().default(0),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pricing_rules_lookup_idx").on(table.sportId, table.isActive, table.priority),
  ],
);

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  kind: text("kind").notNull(),
  discountBps: integer("discount_bps"),
  discountMinor: integer("discount_minor"),
  minSubtotalMinor: integer("min_subtotal_minor").notNull().default(0),
  sportIds: uuidArray("sport_ids").notNull().default([]),
  maxRedemptions: integer("max_redemptions"),
  maxPerCustomer: integer("max_per_customer").notNull().default(1),
  redemptionCount: integer("redemption_count").notNull().default(0),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- People ------------------------------------------------------------------------

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  /** E.164. The natural key: everyone here has a phone, not everyone has email. */
  phone: text("phone").notNull().unique(),
  email: text("email"),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffUsers = pgTable("staff_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: staffRole("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** Only the hash. A database leak must not hand out live sessions. */
    tokenHash: text("token_hash").notNull().unique(),
    actorType: text("actor_type").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staffUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_expiry_idx").on(table.expiresAt)],
);

// --- Maintenance and events --------------------------------------------------------

export const maintenanceBlocks = pgTable("maintenance_blocks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: uuid("resource_id")
    .notNull()
    .references(() => resources.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdBy: uuid("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Operational half of an event. Sanity owns the words and pictures. */
export const events = pgTable("events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
  registrationEnabled: boolean("registration_enabled").notNull().default(false),
  capacity: integer("capacity"),
  /** Kept in step with event_registrations inside the registration transaction. */
  registeredCount: integer("registered_count").notNull().default(0),
  priceMinor: integer("price_minor").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Bookings ----------------------------------------------------------------------

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** Quotable over the phone: "MH-7F3K2Q9X". Not a credential on its own. */
    reference: text("reference").notNull().unique(),
    /** SHA-256 of the token in the confirmation link. The actual access credential. */
    accessTokenHash: text("access_token_hash").notNull(),

    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "restrict" }),

    /** Play window, UTC. The blocking window lives on reservations.during. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),

    status: bookingStatus("status").notNull().default("held"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),

    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    partySize: integer("party_size"),
    notes: text("notes"),

    source: bookingSource("source").notNull().default("online"),
    createdByStaffId: uuid("created_by_staff_id").references(() => staffUsers.id, {
      onDelete: "set null",
    }),

    currency: text("currency").notNull().default("PKR"),
    subtotalMinor: integer("subtotal_minor").notNull().default(0),
    discountMinor: integer("discount_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull().default(0),
    amountPaidMinor: integer("amount_paid_minor").notNull().default(0),
    amountRefundedMinor: integer("amount_refunded_minor").notNull().default(0),
    /** Frozen price breakdown. A later rate change must not rewrite this. */
    pricingSnapshot: jsonb("pricing_snapshot").notNull().default({}),
    /** Frozen cancellation terms, so the policy is judged as it stood when booked. */
    policySnapshot: jsonb("policy_snapshot").notNull().default({}),
    couponCode: text("coupon_code"),

    paymentMethod: text("payment_method"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),

    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancellationReason: text("cancellation_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bookings_starts_at_idx").on(table.startsAt),
    index("bookings_resource_day_idx").on(table.resourceId, table.startsAt),
    index("bookings_customer_idx").on(table.customerId, table.startsAt),
    index("bookings_phone_idx").on(table.customerPhone),
    index("bookings_status_idx").on(table.status, table.startsAt),
  ],
);

/**
 * The one true occupancy table.
 *
 * Bookings, holds, maintenance and event takeovers all land here, which is what lets a
 * single exclusion constraint guarantee no two things ever hold the same court at the
 * same time. That constraint is declared in the SQL migration:
 *
 *   EXCLUDE USING gist (resource_id WITH =, during WITH &&) WHERE (blocks_availability)
 */
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    /** Recorded so the sport-change buffer can see what the neighbour was playing. */
    sportId: uuid("sport_id").references(() => sports.id, { onDelete: "set null" }),
    kind: reservationKind("kind").notNull(),
    /** Half-open [start, end). Play time PLUS the resource's turnaround. */
    during: tstzrange("during").notNull(),
    /** Cancelling flips this to false rather than deleting the history. */
    blocksAvailability: boolean("blocks_availability").notNull().default(true),
    /** Holds only. Expired holds still satisfy the constraint until swept. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    maintenanceId: uuid("maintenance_id").references(() => maintenanceBlocks.id, {
      onDelete: "cascade",
    }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reservations_booking_idx").on(table.bookingId)],
);

// --- Add-ons ------------------------------------------------------------------------

export const addons = pgTable("addons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind").notNull(),
  priceMinor: integer("price_minor").notNull(),
  sportIds: uuidArray("sport_ids").notNull().default([]),
  stockQuantity: integer("stock_quantity"),
  maxPerBooking: integer("max_per_booking").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const bookingAddons = pgTable(
  "booking_addons",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    addonId: uuid("addon_id").references(() => addons.id, { onDelete: "set null" }),
    /** Snapshotted, so the line still reads right after the add-on is renamed. */
    name: text("name").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalMinor: integer("line_total_minor").notNull(),
  },
  (table) => [index("booking_addons_booking_idx").on(table.bookingId)],
);

// --- Café ---------------------------------------------------------------------------

/** Operational mirror of a Sanity menu item: availability and the price charged. */
export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  basePriceMinor: integer("base_price_minor").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  isOrderable: boolean("is_orderable").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const menuItemVariants = pgTable(
  "menu_item_variants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceDeltaMinor: integer("price_delta_minor").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("menu_item_variants_item_idx").on(table.menuItemId)],
);

export const menuItemModifiers = pgTable(
  "menu_item_modifiers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceMinor: integer("price_minor").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("menu_item_modifiers_item_idx").on(table.menuItemId)],
);

export const cafeTables = pgTable("cafe_tables", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull().unique(),
  seats: integer("seats").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const cafeReservations = pgTable(
  "cafe_reservations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: text("reference").notNull().unique(),
    accessTokenHash: text("access_token_hash").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    partySize: integer("party_size").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(90),
    status: cafeRequestStatus("status").notNull().default("requested"),
    tableId: uuid("table_id").references(() => cafeTables.id, { onDelete: "set null" }),
    notes: text("notes"),
    /** True only in instant-confirm mode, which needs real table capacity. */
    autoConfirmed: boolean("auto_confirmed").notNull().default(false),
    staffNote: text("staff_note"),
    decidedBy: uuid("decided_by").references(() => staffUsers.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cafe_reservations_day_idx").on(table.startsAt),
    index("cafe_reservations_status_idx").on(table.status, table.startsAt),
  ],
);

export const cafeTableAllocations = pgTable("cafe_table_allocations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tableId: uuid("table_id")
    .notNull()
    .references(() => cafeTables.id, { onDelete: "cascade" }),
  reservationId: uuid("reservation_id")
    .notNull()
    .references(() => cafeReservations.id, { onDelete: "cascade" }),
  during: tstzrange("during").notNull(),
});

export const cafeOrders = pgTable(
  "cafe_orders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: text("reference").notNull().unique(),
    accessTokenHash: text("access_token_hash").notNull(),
    orderType: cafeOrderType("order_type").notNull(),
    status: cafeOrderStatus("status").notNull().default("pending"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    /** Set for court_addon orders: staff need to know which court to carry it to. */
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    fulfilAt: timestamp("fulfil_at", { withTimezone: true }).notNull(),
    fulfilLocation: text("fulfil_location").notNull().default("counter"),
    notes: text("notes"),
    currency: text("currency").notNull().default("PKR"),
    subtotalMinor: integer("subtotal_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull().default(0),
    amountPaidMinor: integer("amount_paid_minor").notNull().default(0),
    paymentMethod: text("payment_method"),
    rejectedReason: text("rejected_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cafe_orders_queue_idx").on(table.status, table.fulfilAt),
    index("cafe_orders_booking_idx").on(table.bookingId),
  ],
);

export const cafeOrderItems = pgTable(
  "cafe_order_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => cafeOrders.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id").references(() => menuItems.id, { onDelete: "set null" }),
    /** Name, variant and modifiers are snapshotted so a receipt stays truthful. */
    itemName: text("item_name").notNull(),
    variantName: text("variant_name"),
    modifiers: jsonb("modifiers").notNull().default([]),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalMinor: integer("line_total_minor").notNull(),
    notes: text("notes"),
  },
  (table) => [index("cafe_order_items_order_idx").on(table.orderId)],
);

// --- Payments ----------------------------------------------------------------------

export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    provider: text("provider").notNull(),
    status: paymentIntentStatus("status").notNull().default("created"),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    cafeOrderId: uuid("cafe_order_id").references(() => cafeOrders.id, { onDelete: "cascade" }),
    eventRegistrationId: uuid("event_registration_id"),
    currency: text("currency").notNull().default("PKR"),
    /** What the SERVER decided. Webhooks are validated against this. */
    amountMinor: integer("amount_minor").notNull(),
    amountCapturedMinor: integer("amount_captured_minor").notNull().default(0),
    amountRefundedMinor: integer("amount_refunded_minor").notNull().default(0),
    providerReference: text("provider_reference"),
    /** Sent to the provider so a retry cannot create a second charge. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    receiptUrl: text("receipt_url"),
    receiptNote: text("receipt_note"),
    verifiedBy: uuid("verified_by").references(() => staffUsers.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payment_intents_booking_idx").on(table.bookingId),
    index("payment_intents_provider_ref_idx").on(table.provider, table.providerReference),
  ],
);

/**
 * Every inbound webhook lands here first, keyed on the provider's event id.
 * The unique constraint IS the idempotency mechanism: a replayed event cannot be
 * processed twice, so duplicate callbacks cannot produce duplicate confirmations.
 */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** Set when the event was valid but deliberately not acted on. */
    outcome: text("outcome"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_webhook_events_provider_event_id_key").on(
      table.provider,
      table.providerEventId,
    ),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    paymentIntentId: uuid("payment_intent_id")
      .notNull()
      .references(() => paymentIntents.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    providerReference: text("provider_reference"),
    requestedBy: uuid("requested_by").references(() => staffUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [index("refunds_intent_idx").on(table.paymentIntentId)],
);

// --- Event registrations -----------------------------------------------------------

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: text("reference").notNull().unique(),
    accessTokenHash: text("access_token_hash").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    partySize: integer("party_size").notNull().default(1),
    status: text("status").notNull().default("registered"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    totalMinor: integer("total_minor").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("event_registrations_event_idx").on(table.eventId, table.status)],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    customerPhone: text("customer_phone").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("coupon_redemptions_coupon_idx").on(table.couponId)],
);

// --- Notifications -----------------------------------------------------------------

/**
 * Durable outbox. Rows are written in the same transaction as the booking, then
 * delivered by a worker, so a provider outage delays a message but can never lose a
 * booking.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    channel: notificationChannel("channel").notNull(),
    template: text("template").notNull(),
    recipient: text("recipient").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: notificationStatus("status").notNull().default("queued"),
    /** Unique, so retrying the same logical message never sends twice. */
    dedupeKey: text("dedupe_key").notNull().unique(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    /** Transactional messages always send; marketing obeys the opt-in flag. */
    isMarketing: boolean("is_marketing").notNull().default(false),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    cafeOrderId: uuid("cafe_order_id").references(() => cafeOrders.id, { onDelete: "cascade" }),
    cafeReservationId: uuid("cafe_reservation_id").references(() => cafeReservations.id, {
      onDelete: "cascade",
    }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_booking_idx").on(table.bookingId, table.createdAt)],
);

// --- Audit and rate limiting -------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** Already redacted of anything sensitive by the caller. */
    diff: jsonb("diff").notNull().default({}),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_entity_idx").on(table.entityType, table.entityId, table.createdAt),
    index("audit_log_actor_idx").on(table.actorType, table.actorId, table.createdAt),
  ],
);

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  tokens: integer("tokens").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

// Re-exported so callers do not need to reach into drizzle internals for these.
export { check, uniqueIndex };

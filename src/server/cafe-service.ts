import { pool, withTransaction } from "@/lib/db/client";
import { normalisePakistaniPhone } from "@/lib/domain/phone";
import {
  generateAccessToken,
  generateCafeReservationReference,
  notificationDedupeKey,
} from "@/lib/domain/reference";
import { formatVenueDateTimeShort, venueDateToInstant, parseLocalTime } from "@/lib/domain/time";
import { audit, loadOpeningHours } from "./booking-service";
import { getFeatureFlags } from "./public-queries";

/**
 * Café services.
 *
 * Table reservations are REQUESTS unless the venue has both switched on instant
 * confirmation and told us how many tables it has. Without real capacity there is no
 * honest way to confirm a table on the spot, so the default is a request that a member of
 * staff accepts, and every word on screen says so.
 */

export class CafeError extends Error {
  readonly code: "disabled" | "closed" | "invalid" | "not_found" | "no_capacity";
  constructor(code: CafeError["code"], message: string) {
    super(message);
    this.name = "CafeError";
    this.code = code;
  }
}

export interface ReservationRequest {
  name: string;
  phone: string;
  email?: string | null;
  partySize: number;
  date: string;
  /** Venue-local "HH:MM". */
  time: string;
  notes?: string | null;
}

export interface ReservationResult {
  reference: string;
  accessToken: string;
  status: "requested" | "confirmed";
  /** True when a member of staff still has to decide. */
  awaitingApproval: boolean;
}

export async function requestTable(request: ReservationRequest): Promise<ReservationResult> {
  const flags = await getFeatureFlags();
  if (!flags["cafe.tableReservations"]) {
    throw new CafeError("disabled", "Table reservations are not being taken online at the moment.");
  }

  const phone = normalisePakistaniPhone(request.phone);
  const startsAt = venueDateToInstant(request.date, parseLocalTime(request.time));

  if (startsAt.getTime() < Date.now()) {
    throw new CafeError("invalid", "Please choose a time in the future.");
  }

  // The café keeps the venue's hours, so a request outside them is refused rather than
  // quietly accepted and then rejected by a person later.
  const hours = await loadOpeningHours(request.date);
  if (hours.isClosed) {
    throw new CafeError("closed", "The venue is closed on that day.");
  }
  const opensAt = venueDateToInstant(request.date, hours.opensAtMinute);
  const closesAt = venueDateToInstant(
    request.date,
    hours.closesNextDay ? hours.closesAtMinute + 1440 : hours.closesAtMinute,
  );
  if (startsAt < opensAt || startsAt >= closesAt) {
    throw new CafeError("closed", "That is outside opening hours.");
  }

  // Instant confirmation requires knowing how many tables there actually are. Without
  // that, promising a table would be a guess.
  const instantConfirm = flags["cafe.tableInstantConfirm"] === true;

  const reference = generateCafeReservationReference();
  const { token, hash } = generateAccessToken();

  const status = await withTransaction(async (client) => {
    let resolvedStatus: "requested" | "confirmed" = "requested";
    let tableId: string | null = null;

    if (instantConfirm) {
      // Find a table big enough that is free for the whole sitting. The exclusion
      // constraint on cafe_table_allocations is what makes this safe under concurrency.
      const { rows } = await client.query(
        `SELECT t.id FROM cafe_tables t
          WHERE t.is_active AND t.seats >= $1
            AND NOT EXISTS (
              SELECT 1 FROM cafe_table_allocations a
               WHERE a.table_id = t.id
                 AND a.during && tstzrange($2::timestamptz, $3::timestamptz, '[)')
            )
          ORDER BY t.seats ASC
          LIMIT 1`,
        [
          request.partySize,
          startsAt.toISOString(),
          new Date(startsAt.getTime() + 90 * 60_000).toISOString(),
        ],
      );
      if (rows.length === 0) {
        throw new CafeError(
          "no_capacity",
          "We do not have a table free at that time. Try another time, or send a request and we will see what we can do.",
        );
      }
      tableId = rows[0].id;
      resolvedStatus = "confirmed";
    }

    const { rows: created } = await client.query(
      `INSERT INTO cafe_reservations (reference, access_token_hash, customer_name, customer_phone,
                                      customer_email, party_size, starts_at, status, table_id,
                                      notes, auto_confirmed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::cafe_request_status,$9,$10,$11)
       RETURNING id`,
      [
        reference,
        hash,
        request.name.trim(),
        phone.e164,
        request.email?.trim() || null,
        request.partySize,
        startsAt.toISOString(),
        resolvedStatus,
        tableId,
        request.notes?.trim() || null,
        instantConfirm,
      ],
    );
    const reservationId: string = created[0].id;

    if (tableId) {
      await client.query(
        `INSERT INTO cafe_table_allocations (table_id, reservation_id, during)
         VALUES ($1,$2, tstzrange($3::timestamptz, $4::timestamptz, '[)'))`,
        [
          tableId,
          reservationId,
          startsAt.toISOString(),
          new Date(startsAt.getTime() + 90 * 60_000).toISOString(),
        ],
      );
    }

    // Queued in the same transaction, so a messaging outage cannot lose the request.
    for (const [channel, recipient] of [
      ["whatsapp", phone.e164],
      ...(request.email ? ([["email", request.email.trim()]] as const) : []),
    ] as Array<[string, string]>) {
      await client.query(
        `INSERT INTO notifications (channel, template, recipient, payload, dedupe_key, cafe_reservation_id)
         VALUES ($1::notification_channel, $2, $3, $4, $5, $6)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          channel,
          resolvedStatus === "confirmed" ? "table_confirmed" : "table_requested",
          recipient,
          JSON.stringify({
            name: request.name,
            partySize: request.partySize,
            when: formatVenueDateTimeShort(startsAt),
            reference,
          }),
          notificationDedupeKey(["table_request", reservationId, channel, recipient]),
          reservationId,
        ],
      );
    }

    await audit(client, {
      actorType: "customer",
      action: resolvedStatus === "confirmed" ? "cafe.table_confirmed" : "cafe.table_requested",
      entityType: "cafe_reservation",
      entityId: reservationId,
      diff: { reference, partySize: request.partySize, startsAt: startsAt.toISOString() },
    });

    return resolvedStatus;
  });

  return {
    reference,
    accessToken: token,
    status,
    awaitingApproval: status === "requested",
  };
}

/** Staff decision on a table request. */
export async function decideTableRequest(args: {
  reservationId: string;
  staffId: string;
  decision: "confirmed" | "rejected";
  tableId?: string | null;
  staffNote?: string | null;
}): Promise<{ reference: string }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      "SELECT id, reference, starts_at, duration_minutes, status FROM cafe_reservations WHERE id = $1 FOR UPDATE",
      [args.reservationId],
    );
    if (rows.length === 0) throw new CafeError("not_found", "That request could not be found.");
    const reservation = rows[0];

    await client.query(
      `UPDATE cafe_reservations
          SET status = $2::cafe_request_status, table_id = $3, staff_note = $4,
              decided_by = $5, decided_at = now()
        WHERE id = $1`,
      [args.reservationId, args.decision, args.tableId ?? null, args.staffNote ?? null, args.staffId],
    );

    if (args.decision === "confirmed" && args.tableId) {
      // Reuses the same exclusion constraint, so staff cannot double-allocate a table
      // either.
      await client.query(
        `INSERT INTO cafe_table_allocations (table_id, reservation_id, during)
         VALUES ($1,$2, tstzrange($3::timestamptz, $3::timestamptz + make_interval(mins => $4), '[)'))
         ON CONFLICT DO NOTHING`,
        [args.tableId, args.reservationId, reservation.starts_at, reservation.duration_minutes],
      );
    }

    await audit(client, {
      actorType: "staff",
      actorId: args.staffId,
      action: `cafe.table_${args.decision}`,
      entityType: "cafe_reservation",
      entityId: args.reservationId,
      diff: { reference: reservation.reference, note: args.staffNote ?? null },
    });

    return { reference: reservation.reference };
  });
}

/** The café queue for the staff dashboard. */
export async function listTableRequests(options: { status?: string; limit?: number } = {}) {
  const { rows } = await pool().query(
    `SELECT r.id, r.reference, r.customer_name, r.customer_phone, r.party_size, r.starts_at,
            r.status, r.notes, r.staff_note, r.created_at, t.label AS table_label
       FROM cafe_reservations r
       LEFT JOIN cafe_tables t ON t.id = r.table_id
      WHERE ($1::text IS NULL OR r.status::text = $1)
      ORDER BY r.starts_at ASC
      LIMIT $2`,
    [options.status ?? null, options.limit ?? 100],
  );
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    partySize: row.party_size,
    startsAt: new Date(row.starts_at),
    status: row.status as string,
    notes: row.notes as string | null,
    staffNote: row.staff_note as string | null,
    tableLabel: row.table_label as string | null,
    createdAt: new Date(row.created_at),
  }));
}

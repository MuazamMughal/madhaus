import { pool } from "@/lib/db/client";

/**
 * Events.
 *
 * Sanity owns the words and pictures; this table owns capacity and the court an event
 * takes over, because both must be transactional. Only published events with a future or
 * current date are ever returned to the public.
 */

export interface PublicEvent {
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  registrationEnabled: boolean;
  capacity: number | null;
  registeredCount: number;
  spacesLeft: number | null;
  priceMinor: number;
  isFull: boolean;
}

export async function listPublishedEvents(limit = 20): Promise<PublicEvent[]> {
  const { rows } = await pool().query(
    `SELECT slug, title, starts_at, ends_at, registration_enabled, capacity,
            registered_count, price_minor
       FROM events
      WHERE is_published AND ends_at > now()
      ORDER BY starts_at ASC
      LIMIT $1`,
    [limit],
  );
  return rows.map(toPublicEvent);
}

export async function findPublishedEvent(slug: string): Promise<PublicEvent | null> {
  const { rows } = await pool().query(
    `SELECT slug, title, starts_at, ends_at, registration_enabled, capacity,
            registered_count, price_minor
       FROM events WHERE slug = $1 AND is_published`,
    [slug],
  );
  return rows.length > 0 ? toPublicEvent(rows[0]) : null;
}

function toPublicEvent(row: Record<string, unknown>): PublicEvent {
  const capacity = row.capacity as number | null;
  const registered = row.registered_count as number;
  return {
    slug: row.slug as string,
    title: row.title as string,
    startsAt: new Date(row.starts_at as string),
    endsAt: new Date(row.ends_at as string),
    registrationEnabled: row.registration_enabled as boolean,
    capacity,
    registeredCount: registered,
    // Never shown as a countdown when capacity is unknown: "3 left" has to be true.
    spacesLeft: capacity === null ? null : Math.max(capacity - registered, 0),
    priceMinor: row.price_minor as number,
    isFull: capacity !== null && registered >= capacity,
  };
}

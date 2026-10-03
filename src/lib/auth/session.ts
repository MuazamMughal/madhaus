import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { pool } from "@/lib/db/client";
import { serverEnv } from "@/lib/env";

/**
 * Sessions.
 *
 * Opaque random tokens, stored server-side as SHA-256 hashes and looked up on every
 * request. Not JWTs: a session that cannot be revoked is a liability on a system where
 * staff accounts can see every customer's details, and here revoking is one DELETE.
 *
 * The cookie is HttpOnly, SameSite=Lax and Secure outside development.
 */

const STAFF_COOKIE = "madhaus_staff";
const CUSTOMER_COOKIE = "madhaus_customer";

const STAFF_TTL_HOURS = 12;
const CUSTOMER_TTL_DAYS = 60;

export type StaffRole = "owner" | "arena_manager" | "cafe_manager" | "content_editor" | "reception";

export interface StaffSession {
  staffId: string;
  name: string;
  email: string;
  role: StaffRole;
}

export interface CustomerSession {
  customerId: string;
  name: string;
  phone: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function createSession(args: {
  actorType: "staff" | "customer";
  staffId?: string;
  customerId?: string;
  ttlMs: number;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool().query(
    `INSERT INTO sessions (token_hash, actor_type, staff_id, customer_id, expires_at)
     VALUES ($1,$2,$3,$4, now() + make_interval(secs => $5::double precision))`,
    [
      hashToken(token),
      args.actorType,
      args.staffId ?? null,
      args.customerId ?? null,
      args.ttlMs / 1000,
    ],
  );
  return token;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Lax rather than Strict: a customer following their own confirmation link from
    // WhatsApp should still arrive signed in.
    sameSite: "lax" as const,
    secure: serverEnv().NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// --- Staff ---------------------------------------------------------------------------

export async function startStaffSession(staffId: string): Promise<void> {
  const ttlMs = STAFF_TTL_HOURS * 3_600_000;
  const token = await createSession({ actorType: "staff", staffId, ttlMs });
  (await cookies()).set(STAFF_COOKIE, token, cookieOptions(ttlMs / 1000));
  await pool().query("UPDATE staff_users SET last_login_at = now() WHERE id = $1", [staffId]);
}

/**
 * The current staff member, or null.
 *
 * Re-read from the database every time rather than trusted from the cookie, so
 * deactivating an account takes effect on their next request rather than in twelve hours.
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return null;

  const { rows } = await pool().query(
    `SELECT u.id, u.name, u.email, u.role
       FROM sessions s JOIN staff_users u ON u.id = s.staff_id
      WHERE s.token_hash = $1 AND s.actor_type = 'staff' AND s.expires_at > now() AND u.is_active`,
    [hashToken(token)],
  );
  if (rows.length === 0) return null;

  return { staffId: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role };
}

export async function endStaffSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(STAFF_COOKIE)?.value;
  if (token) {
    await pool().query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  store.delete(STAFF_COOKIE);
}

// --- Customers -----------------------------------------------------------------------

export async function startCustomerSession(customerId: string): Promise<void> {
  const ttlMs = CUSTOMER_TTL_DAYS * 86_400_000;
  const token = await createSession({ actorType: "customer", customerId, ttlMs });
  (await cookies()).set(CUSTOMER_COOKIE, token, cookieOptions(ttlMs / 1000));
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;

  const { rows } = await pool().query(
    `SELECT c.id, c.name, c.phone
       FROM sessions s JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = $1 AND s.actor_type = 'customer' AND s.expires_at > now()`,
    [hashToken(token)],
  );
  if (rows.length === 0) return null;

  return { customerId: rows[0].id, name: rows[0].name, phone: rows[0].phone };
}

export async function endCustomerSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (token) {
    await pool().query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  store.delete(CUSTOMER_COOKIE);
}

/** Housekeeping, run from the cron route. */
export async function pruneExpiredSessions(): Promise<number> {
  const { rowCount } = await pool().query("DELETE FROM sessions WHERE expires_at < now()");
  return rowCount ?? 0;
}

export { STAFF_COOKIE, CUSTOMER_COOKIE };

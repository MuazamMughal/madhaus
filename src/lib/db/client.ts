import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { serverEnv } from "@/lib/env";
import { pgSslOptions } from "./ssl";
import * as schema from "./schema";

/**
 * Database access.
 *
 * One pool per process, cached across hot reloads in development so `next dev` does not
 * exhaust Postgres connections on every file save.
 */

declare global {
  var __madhausPool: Pool | undefined;
}

function createPool(): Pool {
  const env = serverEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === "production" ? 10 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...pgSslOptions(env.DATABASE_URL),
  });

  /*
   * The session time zone is UTC, pinned on the database role by migration
   * 0006_session_timezone.sql rather than set here.
   *
   * A `pool.on("connect")` handler issuing `SET TIME ZONE` is the obvious thing to write
   * and is wrong twice over: node-postgres does not await the handler, so the client is
   * handed out while the SET is still queued, and on a transaction-pooling endpoint a SET
   * outside a transaction need not apply to the backend that serves the next statement.
   *
   * Nothing here depends on it for correctness in any case -- every instant is timestamptz
   * and every venue-local conversion happens in lib/domain/time.ts. `npm run db:verify`
   * reports the live session zone.
   */

  pool.on("error", (error) => {
    // An idle client erroring is not fatal; the pool will replace it. Logged without
    // the connection string, which contains the password.
    console.error("[db] idle client error:", error.message);
  });

  return pool;
}

export function pool(): Pool {
  if (!globalThis.__madhausPool) {
    globalThis.__madhausPool = createPool();
  }
  return globalThis.__madhausPool;
}

export type Database = NodePgDatabase<typeof schema>;

let cachedDb: Database | null = null;

export function db(): Database {
  if (!cachedDb) {
    cachedDb = drizzle(pool(), { schema, casing: "snake_case" });
  }
  return cachedDb;
}

export { schema };

/**
 * Postgres error codes this application reacts to by name rather than by message text.
 */
export const PG_ERROR = {
  /** An exclusion constraint was violated: something already holds that court. */
  EXCLUSION_VIOLATION: "23P01",
  UNIQUE_VIOLATION: "23505",
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK_DETECTED: "40P01",
} as const;

interface PgError {
  code?: string;
  constraint?: string;
}

export function pgErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null ? (error as PgError).code : undefined;
}

export function pgConstraintName(error: unknown): string | undefined {
  return typeof error === "object" && error !== null ? (error as PgError).constraint : undefined;
}

/** Did this error come from two parties trying to hold the same court? */
export function isCourtConflict(error: unknown): boolean {
  return (
    pgErrorCode(error) === PG_ERROR.EXCLUSION_VIOLATION &&
    pgConstraintName(error) === "reservations_no_overlap"
  );
}

/**
 * Run work inside a transaction on a dedicated client.
 *
 * Used instead of Drizzle's `transaction()` where the work needs raw SQL for range
 * types, advisory locks or `FOR UPDATE`, which is most of the booking path.
 */
export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection is already broken; the pool will discard it.
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Serialise all writes touching one physical court.
 *
 * The exclusion constraint alone guarantees no overlap, but some rules -- the
 * sport-change buffer especially -- need to READ neighbouring reservations and then
 * decide. Without a lock, two transactions could each read a clear neighbourhood and
 * both insert a legal-looking-but-too-close pair. This makes that read-then-write
 * sequence atomic per court.
 *
 * Taken as a transaction-scoped lock, so it is released on commit or rollback with no
 * unlock call to forget.
 */
export async function lockResource(client: PoolClient, resourceId: string): Promise<void> {
  // hashtextextended gives a stable bigint from the uuid text, which is what
  // pg_advisory_xact_lock wants. The seed is arbitrary but must stay constant.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [resourceId]);
}

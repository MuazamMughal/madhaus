import type { ClientConfig } from "pg";

/**
 * TLS options for a Postgres connection string.
 *
 * Managed Postgres (Neon, Supabase, Vercel) requires TLS and advertises it with
 * `sslmode=require` in the connection string, but node-postgres does not read that
 * parameter -- left alone it connects in the clear and the server refuses. The
 * certificate chain is also not one Node verifies by default, so verification is
 * disabled rather than the connection failing on an unknown issuer.
 *
 * Returns an empty object for a local database, which has no TLS at all.
 */
export function pgSslOptions(connectionString: string): Pick<ClientConfig, "ssl"> {
  return /\bsslmode=require\b/.test(connectionString)
    ? { ssl: { rejectUnauthorized: false } }
    : {};
}

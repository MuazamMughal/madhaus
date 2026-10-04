/**
 * Check that a Postgres connection string can actually run this application.
 *
 * Written for moving to managed Postgres (Neon, Supabase, Vercel). Pasting a connection
 * string and hoping is how you find out in production that the pooled endpoint cannot
 * create extensions, or that `btree_gist` is unavailable and the one constraint the
 * booking system depends on will not build.
 *
 *   npm run db:check                      # checks DATABASE_URL
 *   npm run db:check -- "postgres://..."  # checks a specific one
 *
 * Read-only apart from a temporary table it creates and drops inside a rolled-back
 * transaction, so it is safe against a live database.
 */
import "./load-env";
import { Client } from "pg";
import { pgSslOptions } from "@/lib/db/ssl";

/**
 * Describe a connection failure usefully.
 *
 * Node raises an AggregateError when a host resolves to several addresses and every
 * attempt fails, and its own `message` is empty -- printing it alone tells the reader
 * nothing at all. The causes carry the actual `ECONNREFUSED` / `ENOTFOUND`.
 */
function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const causes = error.errors.map(describeError).filter(Boolean);
    const unique = [...new Set(causes)];
    return unique.join("; ") || "connection refused";
  }
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    return error.message || code || error.name;
  }
  return String(error);
}

type Result = { ok: boolean; label: string; detail: string };

const results: Result[] = [];

function record(ok: boolean, label: string, detail: string) {
  results.push({ ok, label, detail });
}

async function main(): Promise<void> {
  const connectionString = process.argv[2] ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("No connection string. Pass one, or set DATABASE_URL in .env.local.");
    process.exit(1);
  }

  // Never print the password back at the user.
  const safe = connectionString.replace(/:\/\/([^:]+):[^@]+@/, "://$1:****@");
  console.log(`Checking ${safe}\n`);

  const client = new Client({
    connectionString,
    ...pgSslOptions(connectionString),
    // Generous, because a suspended serverless database has to start before it answers.
    connectionTimeoutMillis: 30_000,
  });

  const startedAt = Date.now();
  try {
    await client.connect();
  } catch (error) {
    console.error(`Could not connect: ${describeError(error)}`);
    if (/localhost|127\.0\.0\.1/.test(connectionString)) {
      console.error("\nIs the local database running? npm run db:up");
    } else {
      console.error(
        "\nCheck the string is the one from the provider's dashboard and still ends in" +
          "\n?sslmode=require. For Neon, use the direct host for migrations and the" +
          "\n-pooler host for the app.",
      );
    }
    process.exit(1);
  }
  // A suspended serverless database takes a few seconds to wake. Worth reporting, because
  // it is the difference between "broken" and "cold".
  record(true, "Connection", `${Date.now() - startedAt}ms${Date.now() - startedAt > 2000 ? " (cold start)" : ""}`);

  const { rows: version } = await client.query<{ v: string }>("SELECT version() AS v");
  const major = Number.parseInt(version[0].v.match(/PostgreSQL (\d+)/)?.[1] ?? "0", 10);
  record(major >= 14, "Postgres version", `${major}${major >= 14 ? "" : " — needs 14 or newer"}`);

  // The two extensions the schema cannot be created without.
  for (const extension of ["btree_gist", "pgcrypto"]) {
    const { rows } = await client.query<{ installed: boolean; available: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) AS installed,
              EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = $1) AS available`,
      [extension],
    );
    const { installed, available } = rows[0];
    record(
      installed || available,
      `Extension ${extension}`,
      installed ? "installed" : available ? "available, will install on migrate" : "NOT AVAILABLE",
    );
  }

  // Can we actually create one? Managed providers sometimes allow the extension to exist
  // but not to be created by the application role.
  try {
    await client.query("BEGIN");
    await client.query("CREATE EXTENSION IF NOT EXISTS btree_gist");
    await client.query("ROLLBACK");
    record(true, "Can create extensions", "yes");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    record(false, "Can create extensions", describeError(error));
  }

  /*
   * The exclusion constraint is the whole booking system. If this cannot be built, nothing
   * stops two people holding the same court, so it is checked for real rather than assumed
   * from the extension being present.
   */
  try {
    await client.query("BEGIN");
    await client.query("CREATE EXTENSION IF NOT EXISTS btree_gist");
    await client.query(`
      CREATE TEMP TABLE _check_overlap (
        resource_id uuid NOT NULL,
        during tstzrange NOT NULL,
        blocking boolean NOT NULL DEFAULT true,
        EXCLUDE USING gist (resource_id WITH =, during WITH &&) WHERE (blocking)
      ) ON COMMIT DROP
    `);
    const id = "11111111-1111-1111-1111-111111111111";
    await client.query(
      "INSERT INTO _check_overlap (resource_id, during) VALUES ($1, tstzrange($2,$3,'[)'))",
      [id, "2026-10-10T18:00:00Z", "2026-10-10T19:00:00Z"],
    );

    let rejected = false;
    try {
      await client.query(
        "INSERT INTO _check_overlap (resource_id, during) VALUES ($1, tstzrange($2,$3,'[)'))",
        [id, "2026-10-10T18:30:00Z", "2026-10-10T19:30:00Z"],
      );
    } catch (error) {
      rejected = (error as { code?: string }).code === "23P01";
    }
    await client.query("ROLLBACK");
    record(rejected, "Overlap constraint", rejected ? "rejects double-booking" : "DID NOT REJECT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    record(false, "Overlap constraint", describeError(error));
  }

  // Used to serialise writes per court. Transaction-scoped, so it survives a pooler.
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["check"]);
    await client.query("ROLLBACK");
    record(true, "Advisory locks", "work");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    record(false, "Advisory locks", describeError(error));
  }

  // Used by the hold sweeper and the notification worker.
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE _check_skip (id int) ON COMMIT DROP");
    await client.query("SELECT id FROM _check_skip FOR UPDATE SKIP LOCKED");
    await client.query("ROLLBACK");
    record(true, "FOR UPDATE SKIP LOCKED", "works");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    record(false, "FOR UPDATE SKIP LOCKED", describeError(error));
  }

  /*
   * Reported, not required. No query depends on the session zone for its correctness, but
   * a surprise here is worth seeing, and migration 0006 cannot pin it on providers that
   * withhold ALTER ROLE. current_setting rather than SHOW, whose column is named
   * "TimeZone".
   */
  const { rows: tz } = await client.query<{ tz: string }>(
    "SELECT current_setting('TimeZone') AS tz",
  );
  record(true, "Session timezone", tz[0].tz === "UTC" ? "UTC" : `${tz[0].tz} (expected UTC)`);

  // Is the schema already there?
  const { rows: tables } = await client.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  const tableCount = Number(tables[0].n);
  record(true, "Tables present", tableCount === 0 ? "none — run db:migrate" : String(tableCount));

  await client.end();

  // --- Report ---------------------------------------------------------------------------

  const width = Math.max(...results.map((r) => r.label.length));
  for (const result of results) {
    console.log(`  ${result.ok ? "ok  " : "FAIL"}  ${result.label.padEnd(width)}  ${result.detail}`);
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} check(s) failed. This database cannot run the app as it is.`);
    process.exit(1);
  }

  console.log("\nAll checks passed.");
  if (tableCount === 0) {
    console.log("Next: npm run db:migrate && npm run db:seed");
  }
}

main().catch((error: unknown) => {
  console.error(`\nCheck failed: ${describeError(error)}`);
  process.exit(1);
});

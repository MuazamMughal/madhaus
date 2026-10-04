/**
 * Migration runner.
 *
 * The SQL files in drizzle/migrations are authoritative and are applied in filename
 * order, each in its own transaction, with a record kept so re-running is a no-op.
 *
 * They are hand-written rather than generated because the guarantees that matter most
 * here -- the GiST exclusion constraint on `reservations`, partial unique indexes, the
 * `btree_gist` extension -- are not expressible through the query builder.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { pgSslOptions } from "@/lib/db/ssl";
import "./load-env";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "migrations");

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ...pgSslOptions(connectionString),
  });
  await client.connect();

  try {
    if (reset) {
      if (process.env.NODE_ENV === "production") {
        console.error("Refusing to reset the database with NODE_ENV=production.");
        process.exit(1);
      }
      console.log("Dropping and recreating the public schema…");
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await client.query<{ filename: string }>(
      "SELECT filename FROM _migrations",
    );
    const alreadyApplied = new Set(applied.map((row) => row.filename));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    let ran = 0;
    for (const filename of files) {
      if (alreadyApplied.has(filename)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, filename), "utf8");
      process.stdout.write(`  applying ${filename} … `);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        console.log("ok");
        ran += 1;
      } catch (error) {
        await client.query("ROLLBACK");
        console.log("FAILED");
        throw error;
      }
    }

    console.log(
      ran === 0 ? "Database is already up to date." : `Applied ${ran} migration(s).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("\nMigration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

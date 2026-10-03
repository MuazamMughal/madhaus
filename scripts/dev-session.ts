/**
 * Mint a staff session token for local testing.
 *
 * Development only. It prints a token you can set as the `madhaus_staff` cookie to
 * exercise the dashboard without going through the sign-in form.
 */
import "./load-env";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to mint a session in production.");
    process.exit(1);
  }

  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token, "utf8").digest("hex");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string; email: string; role: string }>(
      "SELECT id, email, role FROM staff_users WHERE is_active ORDER BY role = 'owner' DESC LIMIT 1",
    );
    if (rows.length === 0) {
      console.error("No staff account. Run: npm run db:seed");
      process.exit(1);
    }
    await client.query(
      `INSERT INTO sessions (token_hash, actor_type, staff_id, expires_at)
       VALUES ($1, 'staff', $2, now() + interval '2 hours')`,
      [hash, rows[0].id],
    );
    console.error(`Session for ${rows[0].email} (${rows[0].role}), valid 2 hours.`);
    // Token on stdout alone, so it can be captured with a pipe.
    console.log(token);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

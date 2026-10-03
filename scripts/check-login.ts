/** Development helper: confirm a staff email/password pair actually signs in. */
import "./load-env";
import { Client } from "pg";
import { verifyPassword } from "../src/lib/auth/password";

async function main() {
  const email = process.argv[2] ?? process.env.SEED_OWNER_EMAIL ?? "";
  const password = process.argv[3] ?? process.env.SEED_OWNER_PASSWORD ?? "";

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ password_hash: string; is_active: boolean }>(
      "SELECT password_hash, is_active FROM staff_users WHERE lower(email) = lower($1)",
      [email],
    );
    if (rows.length === 0) {
      console.log(`No account for ${email}`);
      return;
    }
    const ok = await verifyPassword(password, rows[0].password_hash);
    console.log(`email:    ${email}`);
    console.log(`password: ${password}`);
    console.log(`active:   ${rows[0].is_active}`);
    console.log(`verifies: ${ok ? "YES" : "NO"}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

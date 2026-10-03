/**
 * Development helper: approve the oldest pending request and print the payment link.
 *
 * The payment token exists in plaintext only inside the queued notification, so this
 * reads it back out — which is also a check that the link the customer receives is real.
 */
import "./load-env";
import { pool } from "../src/lib/db/client";
import { approveBookingSlot } from "../src/server/booking-service";

async function main(): Promise<void> {
  const { rows: staff } = await pool().query("SELECT id FROM staff_users LIMIT 1");
  if (!staff[0]) throw new Error("No staff account. Run: npm run db:seed");

  const { rows } = await pool().query(
    `SELECT id, reference FROM bookings
      WHERE status = 'pending_approval' AND slot_approved_at IS NULL
      ORDER BY created_at LIMIT 1`,
  );
  if (!rows[0]) {
    console.log("Nothing awaiting approval.");
    return;
  }

  const result = await approveBookingSlot({ bookingId: rows[0].id, staffId: staff[0].id });
  console.log(`${result.reference}: ${result.status}, awaitingPayment=${result.awaitingPayment}`);

  const { rows: notes } = await pool().query(
    `SELECT template, audience, payload ->> 'payUrl' AS pay_url
       FROM notifications WHERE booking_id = $1 ORDER BY created_at`,
    [rows[0].id],
  );
  for (const note of notes) {
    console.log(`  queued: ${note.template} (${note.audience})${note.pay_url ? `\n    ${note.pay_url}` : ""}`);
  }
  await pool().end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

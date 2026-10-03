import { pool } from "@/lib/db/client";
import { adapterForChannel } from "@/lib/notifications/adapters";
import { renderTemplate, templateExists } from "@/lib/notifications/templates";
import { buildBookingIcs } from "@/lib/notifications/ics";
import { formatVenueDateTimeShort } from "@/lib/domain/time";

/**
 * Outbox worker.
 *
 * Claims a batch of due messages with `FOR UPDATE SKIP LOCKED`, so running two workers at
 * once is safe: neither picks up the other's rows. Failures back off exponentially and
 * are retried until `max_attempts`, after which the message is parked as `dead` for a
 * human rather than retried forever.
 *
 * Nothing in here can affect a booking. The worst case is a message that never sends, and
 * the booking page shows its delivery state honestly.
 */

export interface WorkerResult {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  skipped: number;
}

export async function processNotificationOutbox(batchSize = 25): Promise<WorkerResult> {
  const result: WorkerResult = { claimed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 };

  // Claim: mark as sending and hand them to this worker only.
  const { rows: batch } = await pool().query(
    `WITH due AS (
       SELECT id FROM notifications
        WHERE status IN ('queued', 'failed')
          AND next_attempt_at <= now()
          AND attempts < max_attempts
        ORDER BY next_attempt_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     UPDATE notifications n
        SET status = 'sending', attempts = n.attempts + 1
       FROM due
      WHERE n.id = due.id
      RETURNING n.id, n.channel, n.template, n.recipient, n.payload, n.attempts,
                n.max_attempts, n.audience, n.booking_id`,
    [batchSize],
  );

  result.claimed = batch.length;

  for (const row of batch) {
    const id: string = row.id;
    const channel: "email" | "sms" | "whatsapp" = row.channel;
    const attempts: number = row.attempts;
    const maxAttempts: number = row.max_attempts;

    if (!templateExists(row.template)) {
      // A template that does not exist will never start existing on a retry.
      await markDead(id, `No template named "${row.template}".`);
      result.dead += 1;
      continue;
    }

    const audience: "customer" | "venue" = row.audience ?? "customer";
    const adapter = adapterForChannel(channel);
    if (!adapter) {
      // No adapter configured. Park it rather than burn a retry: when the venue
      // configures the channel, these become deliverable.
      await requeue(id, attempts, `No adapter configured for ${channel}.`, 3600);
      result.skipped += 1;
      continue;
    }

    try {
      // A venue-addressed row carries the literal recipient "venue"; the real inbox is
      // resolved now, not when it was queued, so changing the address does not strand
      // messages already in the outbox.
      const recipient = adapter.resolveRecipient
        ? adapter.resolveRecipient(row.recipient, audience)
        : row.recipient;

      if (!recipient) {
        await requeue(
          id,
          attempts,
          audience === "venue"
            ? "VENUE_NOTIFICATION_EMAIL is not set, so the venue cannot be told about this."
            : "No deliverable address for this recipient.",
          3600,
        );
        result.skipped += 1;
        continue;
      }

      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const message = renderTemplate(row.template, payload);
      const attachments = await attachmentsFor(row.template, payload, row.booking_id);
      const delivery = await adapter.send({
        recipient,
        message: attachments ? { ...message, attachments } : message,
      });

      if (delivery.ok) {
        await pool().query(
          "UPDATE notifications SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1",
          [id],
        );
        result.sent += 1;
        continue;
      }

      if (delivery.permanent || attempts >= maxAttempts) {
        await markDead(id, delivery.reason ?? "Delivery failed permanently.");
        result.dead += 1;
        continue;
      }

      // Exponential backoff, capped so a long outage does not push delivery days out.
      await requeue(id, attempts, delivery.reason ?? "Delivery failed.", backoffSeconds(attempts));
      result.failed += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      if (attempts >= maxAttempts) {
        await markDead(id, reason);
        result.dead += 1;
      } else {
        await requeue(id, attempts, reason, backoffSeconds(attempts));
        result.failed += 1;
      }
    }
  }

  return result;
}

/** Attach the calendar invite to a confirmation. */
async function attachmentsFor(
  template: string,
  payload: Record<string, unknown>,
  bookingId: string | null,
): Promise<RenderedAttachment[] | undefined> {
  if (template !== "booking_confirmed" || !bookingId) return undefined;

  const { rows } = await pool().query(
    `SELECT b.reference, b.starts_at, b.ends_at, s.name AS sport_name, r.name AS resource_name
       FROM bookings b
       JOIN sports s ON s.id = b.sport_id
       JOIN resources r ON r.id = b.resource_id
      WHERE b.id = $1`,
    [bookingId],
  );
  if (rows.length === 0) return undefined;
  const booking = rows[0];

  const ics = buildBookingIcs({
    reference: booking.reference,
    summary: `${booking.sport_name} at MadHaus`,
    description: [
      `Booking reference: ${booking.reference}`,
      `Court: ${booking.resource_name}`,
      `Starts: ${formatVenueDateTimeShort(new Date(booking.starts_at))}`,
    ].join("\n"),
    location: String(payload.location ?? "MadHaus, Sahiwal"),
    startsAt: new Date(booking.starts_at),
    endsAt: new Date(booking.ends_at),
    confirmed: true,
    productName: "MadHaus",
    reminderMinutesBefore: 60,
  });

  return [
    {
      filename: `madhaus-${booking.reference}.ics`,
      content: ics,
      contentType: "text/calendar; charset=utf-8; method=PUBLISH",
    },
  ];
}

interface RenderedAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** 1 min, 2, 4, 8… capped at an hour. */
function backoffSeconds(attempts: number): number {
  return Math.min(60 * 2 ** Math.max(attempts - 1, 0), 3600);
}

async function requeue(id: string, _attempts: number, reason: string, delaySeconds: number) {
  await pool().query(
    `UPDATE notifications
        SET status = 'failed', last_error = $2,
            next_attempt_at = now() + make_interval(secs => $3::double precision)
      WHERE id = $1`,
    [id, reason.slice(0, 500), delaySeconds],
  );
}

async function markDead(id: string, reason: string) {
  await pool().query("UPDATE notifications SET status = 'dead', last_error = $2 WHERE id = $1", [
    id,
    reason.slice(0, 500),
  ]);
}

/** Messages a human needs to look at. Surfaced on the dashboard. */
export async function getDeadNotifications(limit = 50) {
  const { rows } = await pool().query(
    `SELECT id, channel, template, recipient, last_error, attempts, created_at, booking_id
       FROM notifications WHERE status = 'dead' ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

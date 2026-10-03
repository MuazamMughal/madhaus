import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { sweepExpiredHolds } from "@/server/booking-service";
import { processNotificationOutbox } from "@/server/notification-worker";
import { pruneExpiredSessions } from "@/lib/auth/session";
import { pruneRateLimitBuckets } from "@/server/rate-limit";

/**
 * Scheduled housekeeping.
 *
 * Run this every minute or two from a scheduler (Vercel Cron, a hosted cron, or a
 * systemd timer hitting the URL). It does four jobs:
 *
 *   1. Release expired checkout holds, so abandoned slots go back on the board.
 *   2. Deliver queued notifications.
 *   3. Delete expired sessions.
 *   4. Tidy up rate-limit buckets.
 *
 * Nothing here is required for correctness of a booking -- holds are also swept on every
 * availability read and every write -- but without it a slot abandoned at 2am stays
 * blocked until someone next looks at that day.
 */
export async function POST(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set, so scheduled jobs are disabled." },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!constantTimeEquals(provided, secret)) {
    // No detail: an attacker learns nothing about why it failed.
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // Each job is independent. One failing must not stop the others -- a broken mail
  // provider should never prevent expired holds being released.
  const [holds, notifications, sessions, buckets] = await Promise.allSettled([
    sweepExpiredHolds(),
    processNotificationOutbox(),
    pruneExpiredSessions(),
    pruneRateLimitBuckets(),
  ]);

  const report = {
    durationMs: Date.now() - startedAt,
    holds: settled(holds),
    notifications: settled(notifications),
    sessionsPruned: settled(sessions),
    rateLimitBucketsPruned: settled(buckets),
  };

  const anyFailed = [holds, notifications, sessions, buckets].some(
    (outcome) => outcome.status === "rejected",
  );
  if (anyFailed) {
    console.error("[cron] one or more jobs failed:", report);
  }

  // Still 200 when a sub-job failed: the run itself completed and the report says what
  // went wrong. A 500 would make the scheduler retry the jobs that did succeed.
  return Response.json(report);
}

function settled<T>(outcome: PromiseSettledResult<T>): T | { error: string } {
  return outcome.status === "fulfilled"
    ? outcome.value
    : { error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

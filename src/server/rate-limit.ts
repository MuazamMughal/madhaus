import { pool } from "@/lib/db/client";

/**
 * Rate limiting for public write endpoints.
 *
 * A fixed window kept in Postgres. Not as precise as a sliding window in Redis, but it
 * needs no extra infrastructure, it survives a restart, and it is shared across every
 * instance -- which an in-memory counter is not.
 *
 * The whole thing is one statement so two concurrent requests cannot both read a stale
 * count and both be allowed.
 */
export async function checkRateLimit(
  key: string,
  options: { tokens: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number; resetsInSeconds: number }> {
  const { rows } = await pool().query<{
    tokens: number;
    window_start: Date;
  }>(
    `INSERT INTO rate_limit_buckets (key, tokens, window_start)
     VALUES ($1, $2 - 1, now())
     ON CONFLICT (key) DO UPDATE SET
       -- A new window resets the allowance; otherwise spend one token, never below -1
       -- so a hammering client cannot underflow the counter.
       tokens = CASE
         WHEN rate_limit_buckets.window_start < now() - make_interval(secs => $3::double precision)
           THEN $2 - 1
         ELSE GREATEST(rate_limit_buckets.tokens - 1, -1)
       END,
       window_start = CASE
         WHEN rate_limit_buckets.window_start < now() - make_interval(secs => $3::double precision)
           THEN now()
         ELSE rate_limit_buckets.window_start
       END
     RETURNING tokens, window_start`,
    [key, options.tokens, options.windowSeconds],
  );

  const row = rows[0];
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;

  return {
    allowed: row.tokens >= 0,
    remaining: Math.max(row.tokens, 0),
    resetsInSeconds: Math.max(Math.ceil(options.windowSeconds - elapsed), 0),
  };
}

/** Housekeeping, called from the cron route alongside the hold sweep. */
export async function pruneRateLimitBuckets(): Promise<number> {
  const { rowCount } = await pool().query(
    "DELETE FROM rate_limit_buckets WHERE window_start < now() - interval '1 day'",
  );
  return rowCount ?? 0;
}

-- Pin the application role's time zone to UTC.
--
-- Every instant this application stores is timestamptz and every conversion to the
-- venue's wall clock happens in application code (src/lib/domain/time.ts), so a session
-- in some other zone does not corrupt stored data. It can still change the answer to a
-- query that casts a date to timestamptz, and five hours is a small enough error to be
-- believed rather than noticed.
--
-- Set on the role rather than per connection for two reasons. A connection-time `SET`
-- races with the first real query on that connection, and on a transaction-pooling
-- endpoint (Neon's pooled host, PgBouncer) a `SET` issued outside a transaction need not
-- apply to the backend that serves the next statement. A role setting is applied by the
-- server to every backend that assumes the role, so neither problem arises. It is also
-- accepted where the `options=-c timezone=UTC` startup parameter is not.
--
-- CURRENT_USER so this works whatever the deployment named its application role.
DO $$
BEGIN
  EXECUTE format('ALTER ROLE %I SET TimeZone = %L', current_user, 'UTC');
EXCEPTION
  -- A managed provider may not grant ALTER ROLE on the role you connect as. Not fatal:
  -- no query in this application depends on the session time zone for its correctness.
  -- `npm run db:verify` reports the session zone so a drift is visible.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not pin the role time zone to UTC (insufficient privilege). Harmless; see 0006_session_timezone.sql.';
END
$$;

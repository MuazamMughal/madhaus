import { config } from "dotenv";

/**
 * Test environment.
 *
 * Integration tests run against a real Postgres, because the guarantees being tested --
 * the exclusion constraint, advisory locks, transaction isolation -- only exist in
 * Postgres. A mock would test the mock.
 *
 * Only the connection string and secrets come from a file. Everything the suite depends
 * on behaviourally is set HERE, so a test never passes or fails because of how someone's
 * local `.env.development.local` happens to be configured, and CI needs nothing but a
 * DATABASE_URL.
 */
config({ path: ".env.test", quiet: true });
config({ path: ".env.local", quiet: true });

// NODE_ENV is typed readonly, but the suite genuinely needs it set before any module
// reads it — the env validator branches on it.
(process.env as Record<string, string>).NODE_ENV = "test";

// Deterministic regardless of the machine's own timezone: every date assertion in the
// suite is about Asia/Karachi, resolved through Intl, not about local time.
process.env.TZ = "UTC";

// The payment methods the suite exercises. Declared here rather than inherited, so the
// tests are the specification of what must work.
process.env.PAYMENT_PROVIDERS ??= "pay_at_venue,bank_transfer";
process.env.BANK_TRANSFER_ACCOUNT_TITLE ??= "TEST ACCOUNT";
process.env.BANK_TRANSFER_ACCOUNT_NUMBER ??= "TEST-0000";

// Messages are rendered and queued during tests; none are delivered anywhere.
process.env.NOTIFICATION_CHANNELS ??= "log";

// Long enough that no test is racing a real clock.
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";

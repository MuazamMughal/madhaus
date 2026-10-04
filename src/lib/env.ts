import { z } from "zod";

/**
 * Environment validation.
 *
 * Parsed once, at first import on the server. A missing DATABASE_URL should stop the
 * process at boot with a readable message, not surface as a connection error inside a
 * customer's checkout.
 *
 * Optional integrations are modelled as "blank means off". That is what makes it
 * possible to run the whole application locally with no third-party credentials, while
 * production refuses to pretend a disabled integration is working.
 */

const nonEmpty = z.string().trim().min(1);

/** Treat "" and unset alike: an empty variable in a .env file means "not configured". */
const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const csvList = z
  .string()
  .trim()
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: nonEmpty.describe("Postgres connection string"),

  // 32 bytes of entropy minimum. Sessions are signed with this.
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48"),

  NEXT_PUBLIC_SANITY_PROJECT_ID: optionalString,
  NEXT_PUBLIC_SANITY_DATASET: z.string().trim().default("production"),
  NEXT_PUBLIC_SANITY_API_VERSION: z.string().trim().default("2026-10-01"),
  SANITY_API_READ_TOKEN: optionalString,
  /**
   * Write access for the Sanity seeder and permission-checked Admin photo uploads.
   */
  SANITY_API_WRITE_TOKEN: optionalString,
  SANITY_REVALIDATE_SECRET: optionalString,

  PAYMENT_PROVIDERS: csvList.default(["pay_at_venue"]),
  JAZZCASH_ACCOUNT_TITLE: optionalString,
  JAZZCASH_ACCOUNT_NUMBER: optionalString,

  NOTIFICATION_CHANNELS: csvList.default(["log"]),
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  /** Where the venue's own alerts go: new requests, submitted payment proofs. */
  VENUE_NOTIFICATION_EMAIL: optionalString,

  WHATSAPP_API_URL: optionalString,
  WHATSAPP_API_TOKEN: optionalString,
  WHATSAPP_FROM_NUMBER: optionalString,

  CRON_SECRET: optionalString,

  SEED_OWNER_EMAIL: optionalString,
  SEED_OWNER_PASSWORD: optionalString,
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new Error(
      `Environment is not valid:\n${lines.join("\n")}\n\nCopy .env.example to .env.local and fill in the missing values.`,
    );
  }

  const env = parsed.data;

  // The simulator exists so the booking flow can be exercised end to end without a
  // merchant account. Letting it reach production would mean showing customers a fake
  // success screen, so it is refused outright rather than warned about.
  if (env.NODE_ENV === "production" && env.PAYMENT_PROVIDERS.includes("simulator")) {
    throw new Error(
      "PAYMENT_PROVIDERS includes 'simulator', which cannot run in production. Remove it and configure a real payment method.",
    );
  }

  cached = env;
  return env;
}

/** Is a given payment adapter both requested and actually configured? */
export function isPaymentProviderEnabled(provider: string): boolean {
  const env = serverEnv();
  if (!env.PAYMENT_PROVIDERS.includes(provider)) return false;
  // JazzCash without account details would show the customer an empty page of
  // instructions, so treat missing details as "not enabled".
  if (provider === "jazzcash") {
    return Boolean(env.JAZZCASH_ACCOUNT_TITLE && env.JAZZCASH_ACCOUNT_NUMBER);
  }
  return true;
}

export function isSanityConfigured(): boolean {
  return Boolean(serverEnv().NEXT_PUBLIC_SANITY_PROJECT_ID);
}

export function isEmailConfigured(): boolean {
  const env = serverEnv();
  return (
    env.NOTIFICATION_CHANNELS.includes("email") &&
    Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
  );
}

/** The venue's own inbox. Without it, venue-addressed messages cannot be delivered. */
export function venueEmail(): string | undefined {
  return serverEnv().VENUE_NOTIFICATION_EMAIL;
}

export function isWhatsAppConfigured(): boolean {
  const env = serverEnv();
  return (
    env.NOTIFICATION_CHANNELS.includes("whatsapp") &&
    Boolean(env.WHATSAPP_API_URL && env.WHATSAPP_API_TOKEN && env.WHATSAPP_FROM_NUMBER)
  );
}

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Booking references and the access tokens that guard them.
 *
 * The reference is quotable over a noisy phone line; the token is what actually
 * authorises access. Knowing "MH-7F3K2Q9X" must not be enough to open someone
 * else's booking, so /booking/[reference] requires both.
 */

/**
 * Crockford base32 minus the vowels. No I/L/O/U, so there is nothing to confuse
 * with 1/0, and no chance of a reference spelling a word.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const REFERENCE_BODY_LENGTH = 8;

/** 8 symbols over a 32-symbol alphabet is 40 bits: ~1.1 x 10^12 references. */
export function generateBookingReference(prefix = "MH"): string {
  return `${prefix}-${randomSymbols(REFERENCE_BODY_LENGTH)}`;
}

export function generateCafeOrderReference(): string {
  return `MC-${randomSymbols(REFERENCE_BODY_LENGTH)}`;
}

export function generateCafeReservationReference(): string {
  return `MT-${randomSymbols(REFERENCE_BODY_LENGTH)}`;
}

export function generateEventRegistrationReference(): string {
  return `ME-${randomSymbols(REFERENCE_BODY_LENGTH)}`;
}

const REFERENCE_PATTERN = new RegExp(`^(MH|MC|MT|ME)-[${ALPHABET}]{${REFERENCE_BODY_LENGTH}}$`);

/**
 * Normalise user-typed references before looking them up: uppercase, and map the
 * characters people substitute for the ones the alphabet omits.
 */
export function normaliseReference(input: string): string | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/\s/g, "")
    .replace(/[IL]/g, "1")
    .replace(/[OU]/g, "0");
  const withDash = cleaned.includes("-") ? cleaned : `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
  return REFERENCE_PATTERN.test(withDash) ? withDash : null;
}

/**
 * A 256-bit access token. The plaintext goes in the confirmation link and is never
 * stored; only the hash is persisted, so a database leak cannot open bookings.
 */
export function generateAccessToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashAccessToken(token) };
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison, so response timing cannot be used to guess a token. */
export function accessTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashAccessToken(token), "hex");
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, "hex");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Deterministic key for the notification outbox. The same logical message always
 * produces the same key, so the unique index makes re-sends impossible.
 */
export function notificationDedupeKey(
  parts: readonly (string | number)[],
): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 40);
}

function randomSymbols(length: number): string {
  // Rejection-free because 256 is a whole multiple of 32: each byte's low 5 bits are
  // uniform over the alphabet.
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] & 0b11111];
  }
  return out;
}

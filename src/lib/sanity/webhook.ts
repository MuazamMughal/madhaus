import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Sanity webhook delivery.
 *
 * The header looks like `t=<unix millis>,v1=<base64url hmac>`, and the signed payload is
 * `<timestamp>.<body>` — which is why the handler must read the RAW body. Re-serialising
 * parsed JSON would not reproduce the bytes Sanity signed.
 *
 * Extracted from the route handler so it can be tested directly: this is the only thing
 * standing between a public URL and anyone being able to make the site purge its cache
 * on demand.
 */

/** Deliveries older than this are refused, so a captured request cannot be replayed. */
const MAX_AGE_MS = 5 * 60 * 1000;

export function verifySanityWebhookSignature(
  body: string,
  header: string,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!secret) return false;

  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const [key, ...rest] = piece.trim().split("=");
      return [key, rest.join("=")];
    }),
  );

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = Math.abs(now - Number.parseInt(timestamp, 10));
  if (!Number.isFinite(age) || age > MAX_AGE_MS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");

  const provided = Buffer.from(signature, "utf8");
  const computed = Buffer.from(expected, "utf8");
  // Length check first: timingSafeEqual throws on a mismatch rather than returning false.
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}

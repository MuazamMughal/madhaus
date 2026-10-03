import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { serverEnv } from "@/lib/env";

/**
 * Sanity publish webhook.
 *
 * Sanity signs each delivery; this verifies the signature before acting on it, so a
 * forged request cannot make the site purge its cache repeatedly.
 *
 * Only the tags for the document type that actually changed are revalidated, rather than
 * everything, so publishing one menu item does not evict the whole site.
 */
export async function POST(request: Request) {
  const secret = serverEnv().SANITY_REVALIDATE_SECRET;
  if (!secret) {
    return Response.json(
      { error: "SANITY_REVALIDATE_SECRET is not set, so the webhook is disabled." },
      { status: 503 },
    );
  }

  // The raw body is needed for signature verification -- re-serialising parsed JSON
  // would not reproduce the bytes Sanity signed.
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("sanity-webhook-signature");

  if (!signatureHeader || !verifySignature(rawBody, signatureHeader, secret)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { _type?: string; slug?: { current?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Body was not JSON" }, { status: 400 });
  }

  const documentType = payload._type;
  if (!documentType) {
    return Response.json({ error: "Payload had no _type" }, { status: 400 });
  }

  // Always revalidate the type's own tag, plus anything that embeds it.
  const tags = new Set<string>([documentType]);
  const alsoAffects: Record<string, string[]> = {
    // The header and footer read site settings on every page.
    siteSettings: ["homepage", "navigation"],
    navigation: ["homepage"],
    menuItem: ["cafePage", "homepage"],
    menuCategory: ["menuItem", "cafePage"],
    event: ["homepage"],
    offer: ["homepage"],
    testimonial: ["homepage"],
  };
  for (const extra of alsoAffects[documentType] ?? []) tags.add(extra);

  // Next 16 requires a cache-life profile. "max" gives stale-while-revalidate: the next
  // visitor is served the cached page immediately while the fresh one is fetched behind
  // them, and everyone after that gets the new content. `updateTag`, which is immediate,
  // is only callable from a Server Action, not from a route handler like this one.
  for (const tag of tags) revalidateTag(tag, "max");

  return Response.json({ revalidated: [...tags], at: new Date().toISOString() });
}

/**
 * Sanity's signature header: `t=<timestamp>,v1=<base64url hmac>`.
 * The signed payload is `<timestamp>.<body>`.
 */
function verifySignature(body: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const [key, ...rest] = piece.trim().split("=");
      return [key, rest.join("=")];
    }),
  );

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject anything older than five minutes, so a captured request cannot be replayed
  // indefinitely.
  const age = Math.abs(Date.now() - Number.parseInt(timestamp, 10));
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("base64url");

  const provided = Buffer.from(signature, "utf8");
  const computed = Buffer.from(expected, "utf8");
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}

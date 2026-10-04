import { verifySanityWebhookSignature } from "@/lib/sanity/webhook";
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

  if (!signatureHeader || !verifySanityWebhookSignature(rawBody, signatureHeader, secret)) {
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

  /*
   * `{ expire: 0 }` rather than a named profile.
   *
   * A profile like "max" gives stale-while-revalidate: the next visitor still sees the OLD
   * page while the new one is fetched behind them. For a CMS publish that is the wrong
   * trade — an editor who just pressed Publish and reloads expects to see their change,
   * not the previous version. Expiring immediately costs one slow request and is correct.
   *
   * `updateTag` would also be immediate but is only callable from a Server Action, not
   * from a route handler like this one.
   */
  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  return Response.json({ revalidated: [...tags], at: new Date().toISOString() });
}


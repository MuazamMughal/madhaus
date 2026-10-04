import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySanityWebhookSignature } from "@/lib/sanity/webhook";

/**
 * The revalidation endpoint is a public URL. This signature check is the only thing
 * stopping anyone making the site purge its cache on demand, so it is tested directly
 * rather than only exercised through the route.
 */

const SECRET = "test-revalidation-secret";
const BODY = JSON.stringify({ _type: "siteSettings", _id: "siteSettings" });

function sign(body: string, timestamp: number, secret = SECRET): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");
  return `t=${timestamp},v1=${mac}`;
}

describe("Sanity webhook signatures", () => {
  const now = 1_790_000_000_000;

  it("accepts a genuine delivery", () => {
    expect(verifySanityWebhookSignature(BODY, sign(BODY, now), SECRET, now)).toBe(true);
  });

  it("rejects a forged signature", () => {
    expect(
      verifySanityWebhookSignature(BODY, `t=${now},v1=bm90LXRoZS1zaWduYXR1cmU`, SECRET, now),
    ).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const header = sign(BODY, now, "someone-elses-secret");
    expect(verifySanityWebhookSignature(BODY, header, SECRET, now)).toBe(false);
  });

  it("rejects a body that was tampered with after signing", () => {
    const header = sign(BODY, now);
    const tampered = JSON.stringify({ _type: "siteSettings", _id: "something-else" });
    expect(verifySanityWebhookSignature(tampered, header, SECRET, now)).toBe(false);
  });

  it("rejects a replayed delivery older than five minutes", () => {
    const header = sign(BODY, now);
    // Same valid signature, arriving ten minutes later.
    expect(verifySanityWebhookSignature(BODY, header, SECRET, now + 10 * 60_000)).toBe(false);
    // Still fine within the window.
    expect(verifySanityWebhookSignature(BODY, header, SECRET, now + 4 * 60_000)).toBe(true);
  });

  it("rejects a delivery timestamped in the future beyond the window", () => {
    const header = sign(BODY, now + 10 * 60_000);
    expect(verifySanityWebhookSignature(BODY, header, SECRET, now)).toBe(false);
  });

  it("rejects malformed and incomplete headers", () => {
    for (const header of [
      "nonsense",
      "",
      `t=${now}`,
      "v1=abc",
      `t=notanumber,v1=abc`,
      `t=${now},v1=`,
    ]) {
      expect(verifySanityWebhookSignature(BODY, header, SECRET, now), header).toBe(false);
    }
  });

  it("rejects everything when no secret is configured", () => {
    // An unset secret must not mean "accept anything".
    expect(verifySanityWebhookSignature(BODY, sign(BODY, now, ""), "", now)).toBe(false);
  });
});

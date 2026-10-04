/**
 * Fire a correctly-signed webhook at the local revalidation endpoint.
 *
 * Proves the endpoint accepts a genuine Sanity delivery and rejects a forged one, without
 * needing a public URL or a tunnel.
 */
import "./load-env";
import { createHmac } from "node:crypto";

const secret = process.env.SANITY_REVALIDATE_SECRET;
if (!secret) {
  console.error("SANITY_REVALIDATE_SECRET is not set.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const docType = process.argv[2] ?? "siteSettings";

async function deliver(body: string, signature: string, label: string) {
  const res = await fetch(`${url}/api/revalidate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "sanity-webhook-signature": signature },
    body,
  });
  console.log(`  ${label}: ${res.status} ${await res.text()}`);
}

const body = JSON.stringify({ _type: docType, _id: docType });
const ts = Date.now().toString();
const good = createHmac("sha256", secret).update(`${ts}.${body}`).digest("base64url");

await deliver(body, `t=${ts},v1=${good}`, "valid signature      ");
await deliver(body, `t=${ts},v1=bm90LXRoZS1zaWduYXR1cmU`, "forged signature     ");
await deliver(body, `t=${Date.now() - 10 * 60_000},v1=${good}`, "replayed (10 min old)");
await deliver(body, "nonsense", "malformed header     ");

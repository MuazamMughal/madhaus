/**
 * Temporarily change a field in Sanity to prove whether a page reads the CMS or the local
 * sample fallback. The two are seeded with identical text, so comparing strings proves
 * nothing on its own.
 *
 * Always reverts. Development only.
 */
import "./load-env";

const pid = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const ds = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!token) {
  console.error("SANITY_API_WRITE_TOKEN is not set.");
  process.exit(1);
}

async function patch(id: string, set: Record<string, unknown>) {
  const res = await fetch(`https://${pid}.api.sanity.io/v2026-10-01/data/mutate/${ds}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mutations: [{ patch: { id, set } }] }),
  });
  const json = (await res.json()) as { error?: { description?: string } };
  if (json.error) throw new Error(json.error.description ?? JSON.stringify(json.error));
}

const [id, field, value] = process.argv.slice(2);
await patch(id, { [field]: value });
console.log(`set ${id}.${field} = ${JSON.stringify(value)}`);

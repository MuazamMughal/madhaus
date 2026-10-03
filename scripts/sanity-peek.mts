/** Quick look at what is in the Sanity dataset. Read-only. */
import "./load-env";

const pid = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const ds = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";

async function groq<T>(query: string): Promise<T> {
  const res = await fetch(
    `https://${pid}.api.sanity.io/v2026-10-01/data/query/${ds}?query=${encodeURIComponent(query)}`,
  );
  const json = (await res.json()) as { result?: T; error?: unknown };
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result as T;
}

const q = process.argv[2] ?? '*[_type == "sportPage"]{_id, title, slug, blurb}';
console.log(JSON.stringify(await groq(q), null, 2));

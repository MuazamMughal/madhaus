import { createClient, type QueryParams } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";
import { serverEnv } from "@/lib/env";
import type { ImageRef } from "@/lib/content/types";

/**
 * Sanity read client.
 *
 * Published content is fetched with the CDN and cached by tag, so a content edit
 * invalidates exactly the pages that used it via the signed revalidation webhook
 * (see app/api/revalidate/route.ts) rather than a blanket timed purge.
 *
 * Drafts are read with a token and never cached. That token is server-only; it is never
 * passed to a client component.
 */

/**
 * In development, edits must show up on the next refresh.
 *
 * A Sanity webhook cannot reach localhost, so the production revalidation path does
 * nothing on a developer's machine. Rather than leave editors wondering why a change has
 * not appeared, development reads bypass both caches: Sanity's CDN (eventually
 * consistent) and Next's fetch cache.
 *
 * It costs an uncached API request per read, which is irrelevant locally and would not be
 * in production — hence the switch.
 */
function liveEditing(): boolean {
  return serverEnv().NODE_ENV !== "production";
}

export function sanityClient(options: { preview?: boolean } = {}) {
  const env = serverEnv();
  if (!env.NEXT_PUBLIC_SANITY_PROJECT_ID) {
    throw new Error("Sanity is not configured. Set NEXT_PUBLIC_SANITY_PROJECT_ID.");
  }

  return createClient({
    projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: env.NEXT_PUBLIC_SANITY_DATASET,
    apiVersion: env.NEXT_PUBLIC_SANITY_API_VERSION,
    // Drafts must come from the origin and never from a shared cache. In development the
    // CDN is skipped entirely so an edit is visible on the next refresh.
    useCdn: !options.preview && !liveEditing(),
    ...(options.preview
      ? { token: env.SANITY_API_READ_TOKEN, perspective: "drafts" as const }
      : { perspective: "published" as const }),
  });
}

export async function sanityFetch<T>({
  query,
  params = {},
  tags = [],
  preview = false,
}: {
  query: string;
  params?: QueryParams;
  /** Cache tags, matched by the revalidation webhook against the changed document type. */
  tags?: string[];
  preview?: boolean;
}): Promise<T> {
  const client = sanityClient({ preview });

  // Drafts are per-request by definition; so is everything in development, so an edit in
  // the Studio appears on the next refresh without a webhook that cannot reach localhost.
  if (preview || liveEditing()) {
    return client.fetch<T>(query, params, { cache: "no-store" });
  }

  return client.fetch<T>(query, params, {
    next: { tags: ["sanity", ...tags] },
  });
}

/** Normalise a Sanity image into the shape components expect, or null if absent. */
export function imageRef(input: unknown): ImageRef | null {
  if (!input || typeof input !== "object") return null;
  const source = input as {
    alt?: string;
    hotspot?: { x: number; y: number };
    asset?: { url?: string; metadata?: { lqip?: string; dimensions?: { width: number; height: number } } };
  };
  const url = source.asset?.url;
  if (!url) return null;

  return {
    url,
    // Alt text is required by the schema; an empty string here means the document
    // predates that rule, and an empty alt is better than a wrong one.
    alt: source.alt ?? "",
    width: source.asset?.metadata?.dimensions?.width,
    height: source.asset?.metadata?.dimensions?.height,
    hotspot: source.hotspot,
    lqip: source.asset?.metadata?.lqip,
  };
}

/**
 * Turn a Sanity `link` object into something a `<Link>` can use.
 *
 * The Studio stores a link as `{ kind, path, url, label }` — an internal path OR an
 * external URL, never both — because that is what makes the editing experience sane. The
 * application wants `{ label, href }`.
 *
 * Returning `null` rather than a partial object is the important part: a half-filled link
 * in the CMS must not produce `href: undefined`, which is a hard React error that takes
 * the whole page down. The caller falls back instead.
 */
export function resolveLink(input: unknown): { label: string; href: string } | null {
  if (!input || typeof input !== "object") return null;

  const link = input as { label?: string; kind?: string; path?: string; url?: string };
  const label = typeof link.label === "string" ? link.label.trim() : "";
  if (label === "") return null;

  if (link.kind === "external") {
    return typeof link.url === "string" && link.url !== "" ? { label, href: link.url } : null;
  }

  // Internal. Only ever a path on this site: an editor pasting a full URL here would
  // otherwise become an open redirect in the navigation.
  const path = typeof link.path === "string" ? link.path.trim() : "";
  if (path === "" || !path.startsWith("/") || path.startsWith("//")) return null;
  return { label, href: path };
}

/** Resolve a list of links, dropping any that are not usable. */
export function resolveLinks(input: unknown): Array<{ label: string; href: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .map(resolveLink)
    .filter((link): link is { label: string; href: string } => link !== null);
}

/** Builder for responsive srcsets from a Sanity asset reference. */
export function sanityImageUrl(source: Parameters<ReturnType<typeof imageUrlBuilder>["image"]>[0]) {
  return imageUrlBuilder(sanityClient()).image(source);
}

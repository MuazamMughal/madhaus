import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/content";
import { isSampleContent, getPublicSports } from "@/server/public-queries";
import { listPublishedEvents } from "@/server/event-queries";

/**
 * Sitemap.
 *
 * Only genuinely public, indexable pages. Everything behind a token or a sign-in is
 * excluded, and the whole sitemap is withheld while the site is showing sample content —
 * inviting a crawler to index placeholder copy would misrepresent the venue.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (await isSampleContent()) return [];

  const [sports, events] = await Promise.all([getPublicSports(), listPublishedEvents(100)]);
  const now = new Date();

  const staticRoutes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/arena", priority: 0.9, changeFrequency: "monthly" },
    { path: "/cafe", priority: 0.9, changeFrequency: "monthly" },
    { path: "/menu", priority: 0.8, changeFrequency: "weekly" },
    { path: "/events", priority: 0.7, changeFrequency: "weekly" },
    { path: "/offers", priority: 0.6, changeFrequency: "weekly" },
    { path: "/gallery", priority: 0.5, changeFrequency: "monthly" },
    { path: "/about", priority: 0.6, changeFrequency: "yearly" },
    { path: "/contact", priority: 0.7, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
    { path: "/cancellation-policy", priority: 0.3, changeFrequency: "yearly" },
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: siteUrl(route.path),
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    // Only sports the venue has switched on. A deactivated sport has no page to index.
    ...sports.map((sport) => ({
      url: siteUrl(`/arena/${sport.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...events.map((event) => ({
      url: siteUrl(`/events/${event.slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

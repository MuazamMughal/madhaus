import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/content";
import { isSampleContent } from "@/server/public-queries";

/**
 * robots.txt
 *
 * While the site is running on sample content, everything is disallowed: placeholder
 * prices and a fake menu appearing in search results would misrepresent a real business.
 * Once real CMS content is live, only the private areas stay out.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (await isSampleContent()) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",       // staff only
          "/studio",      // CMS
          "/account",     // a customer's own records
          "/booking/",    // token-guarded, one customer's booking
          "/book/checkout/",
          "/api/",
        ],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
  };
}

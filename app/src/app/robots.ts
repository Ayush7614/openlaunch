import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/chainPublic";

/**
 * Crawlers may index the launchpad; /admin and all /api/* stay out.
 * The sitemap is advertised here so token pages are discoverable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

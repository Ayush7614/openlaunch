import type { MetadataRoute } from "next";
import { BRAND, BRAND_DOMAIN, TAGLINE } from "@/lib/brand";

/** PWA manifest. Icons reuse the existing Next app-icon routes. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND_DOMAIN} — ${TAGLINE}`,
    short_name: BRAND,
    description: TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: "#FAFAF8",
    theme_color: "#FAFAF8",
    // "any" is only meaningful for SVG; raster icons declare their real pixel size (icon.png is 512²).
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

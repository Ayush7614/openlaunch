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
    icons: [
      { src: "/icon.png", sizes: "any", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

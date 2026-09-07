import { NextResponse, type NextRequest } from "next/server";
import { BRAND_DOMAIN, LEGACY_DOMAIN } from "@/lib/brand";

/**
 * basebid.lol → openlaunch.lol. Permanent redirect for pages; /api stays served
 * on both hosts because early launches carry basebid.lol metadata URIs on-chain.
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  if ((host === LEGACY_DOMAIN || host === `www.${LEGACY_DOMAIN}` || host === `www.${BRAND_DOMAIN}`) && !req.nextUrl.pathname.startsWith("/api/")) {
    const url = req.nextUrl.clone();
    url.host = BRAND_DOMAIN;
    url.port = "";
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon|icon|apple-icon|opengraph-image).*)"] };

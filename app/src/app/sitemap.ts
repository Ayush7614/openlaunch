import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/chainPublic";
import { maybeDb } from "@/lib/db";
import { staticSitemapEntries, tokenSitemapEntries, type TokenRow } from "@/lib/seo";

/**
 * Sitemap: static routes plus the newest launches (fail-soft).
 * The DB is an index of the chain (see db/schema.sql); when it is
 * unconfigured or unreachable we still serve the static routes so
 * crawlers always get a valid sitemap instead of a 500.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = staticSitemapEntries(SITE_URL);
  let tokens: TokenRow[] = [];
  try {
    const sql = maybeDb();
    if (sql) {
      const rows = (await sql`
        SELECT chain_id, token, block_time
        FROM bb_launches
        WHERE chain_id IN (8453, 4663)
        ORDER BY block_time DESC
        LIMIT 1000
      `) as unknown as { chain_id: number; token: string; block_time: string | null }[];
      tokens = rows
        .map((r) => ({
          chain: r.chain_id === 4663 ? ("robinhood" as const) : ("base" as const),
          token: String(r.token ?? "").toLowerCase(),
          block_time: r.block_time,
        }))
        .filter((r) => /^0x[0-9a-f]{40}$/.test(r.token));
    }
  } catch {
    tokens = [];
  }
  return [...statics, ...tokenSitemapEntries(SITE_URL, tokens)];
}

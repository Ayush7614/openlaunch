import { NextResponse } from "next/server";
import { readMeta } from "@/lib/launchpad/meta";

export const dynamic = "force-dynamic";

/** GET /api/launch/meta/<launcher>/<meta_key> — the on-chain metadataURI form (stable while the salt search runs). */
export async function GET(_req: Request, ctx: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = await ctx.params;
  const m = await readMeta({ launcher: a, key: b });
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(m, { headers: { "cache-control": "public, max-age=300" } });
}

import { NextResponse } from "next/server";
import { looksLikeBot, prunePresence, readPulse, recordBeacon, visitorHash } from "@/lib/launchpad/presence";
import { memo } from "@/lib/launchpad/memo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → {visits, online}. POST (browser beacon) → records presence, returns the same. No cookies, no PII stored. */
export async function GET() {
  return NextResponse.json(await memo("pulse", 2_000, () => readPulse()), { headers: { "cache-control": "no-store" } });
}

let lastPrune = 0;

export async function POST(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  if (looksLikeBot(ua)) return NextResponse.json(await readPulse(), { headers: { "cache-control": "no-store" } });
  const ip = (req.headers.get("fly-client-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
  const pulse = await recordBeacon(visitorHash(ip, ua));
  if (Date.now() - lastPrune > 3_600_000) {
    lastPrune = Date.now();
    void prunePresence().catch(() => {});
  }
  return NextResponse.json(pulse, { headers: { "cache-control": "no-store" } });
}

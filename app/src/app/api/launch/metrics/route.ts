import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { isChainKey } from "@/lib/chainPublic";
import { getLaunchMetrics } from "@/lib/launchpad/metricsServer";

export const dynamic = "force-dynamic";

/** GET /api/launch/metrics?chain=base&token=0x… → per‑launch metrics (holders, supply, trades, volume, fees). 30‑second memo per launch. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = u.searchParams.get("chain");
  const token = u.searchParams.get("token");
  if (!isChainKey(chain) || !token || !isAddress(token)) return NextResponse.json({ error: "bad params" }, { status: 400 });
  try {
    const metrics = await getLaunchMetrics(chain, token);
    if (!metrics) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(metrics, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[launch] metrics failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "could not load metrics" }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { isChainKey } from "@/lib/chainPublic";
import { applyLaunchTx, pollAll } from "@/lib/launchpad/indexer";

export const dynamic = "force-dynamic";

/** POST /api/launch/sync?chain=base|robinhood&tx=0x…  → apply one receipt now. No tx → poll every configured chain. */
export async function POST(req: Request) {
  const u = new URL(req.url);
  const tx = u.searchParams.get("tx");
  const chain = u.searchParams.get("chain") ?? "base";
  if (tx) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return NextResponse.json({ error: "bad tx" }, { status: 400 });
    if (!isChainKey(chain)) return NextResponse.json({ error: "bad chain" }, { status: 400 });
    try {
      return NextResponse.json(await applyLaunchTx(chain, tx as `0x${string}`));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "sync failed" }, { status: 502 });
    }
  }
  try {
    return NextResponse.json(await pollAll());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "sync failed" }, { status: 502 });
  }
}

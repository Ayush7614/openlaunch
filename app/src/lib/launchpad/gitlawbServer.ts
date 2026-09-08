import "server-only";
import { publicClient } from "@/lib/chain";
import { STATE_VIEW_ABI } from "./abi";
import { launchpad } from "./config";
import { ethUsd } from "./ethPrice";
import { GITLAWB_POOL_ID, gitlawbUsdFromSqrtPrice } from "./gitlawb";

/**
 * USD per GITLAWB, server-side: StateView.getSlot0(WETH/GITLAWB pool) × ETH/USD, cached 60s.
 * Fails soft: a transient RPC error (or an out-of-window reading) keeps the last good price for up to
 * 15 minutes; after that, GITLAWB-quoted launches simply show no USD (and rank with 0 weight in USD
 * sorts) until the next successful read.
 */
let cached: { at: number; usd: number | null; goodAt: number } = { at: 0, usd: null, goodAt: 0 };
let inflight: Promise<number | null> | null = null;
const TTL = 60_000;
/** A last-good price is reused through transient failures for at most this long; after that GITLAWB shows no USD. */
const MAX_STALE = 15 * 60_000;

function lastGood(now: number): number | null {
  return now - cached.goodAt <= MAX_STALE ? cached.usd : null;
}

async function read(): Promise<number | null> {
  const [eth, slot0] = await Promise.all([
    ethUsd(),
    publicClient("base").readContract({ address: launchpad("base").v4.stateView, abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [GITLAWB_POOL_ID] }),
  ]);
  return gitlawbUsdFromSqrtPrice(slot0[0], eth);
}

export async function gitlawbUsd(): Promise<number | null> {
  if (Date.now() - cached.at < TTL) return cached.usd;
  inflight ??= read()
    .then((usd) => {
      const now = Date.now();
      cached = usd !== null ? { at: now, usd, goodAt: now } : { at: now, usd: lastGood(now), goodAt: cached.goodAt };
      return cached.usd;
    })
    .catch((err) => {
      console.warn("[gitlawb] price read failed:", err instanceof Error ? err.message : err);
      const now = Date.now();
      cached = { at: now, usd: lastGood(now), goodAt: cached.goodAt };
      return cached.usd;
    })
    .finally(() => (inflight = null));
  return inflight;
}

import "server-only";
import { publicClient } from "@/lib/chain";
import { STATE_VIEW_ABI } from "./abi";
import { launchpad } from "./config";
import { ethUsd } from "./ethPrice";
import { GITLAWB_POOL_ID, gitlawbUsdFromSqrtPrice } from "./gitlawb";

/**
 * USD per GITLAWB, server-side: StateView.getSlot0(WETH/GITLAWB pool) × ETH/USD.
 *
 * Stale-while-revalidate so it never sits on a request's critical path once warm: a fresh value is
 * served for 60s; after that the cached value is returned immediately and ONE refresh runs in the
 * background. Only a cold process (no value yet) awaits the read, and that wait is capped at 4s.
 * Failures keep the last good price for up to 15 minutes; after that GITLAWB pools simply show no
 * USD (and rank with 0 weight in USD sorts) until a read succeeds. Never throws.
 */
let usdNow: number | null = null;
let goodAt = 0; // when usdNow was last read successfully
let refreshedAt = 0; // when the last refresh attempt finished
let inflight: Promise<void> | null = null;
const FRESH_MS = 60_000;
const MAX_STALE_MS = 15 * 60_000;
const COLD_WAIT_MS = 4_000;
const READ_TIMEOUT_MS = 8_000;

async function read(): Promise<number | null> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${READ_TIMEOUT_MS}ms`)), READ_TIMEOUT_MS).unref?.());
  const [eth, slot0] = await Promise.race([
    Promise.all([ethUsd(), publicClient("base").readContract({ address: launchpad("base").v4.stateView, abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [GITLAWB_POOL_ID] })]),
    timeout,
  ]);
  return gitlawbUsdFromSqrtPrice(slot0[0], eth, (usd) => console.warn(`[gitlawb] implausible price reading: $${usd} per GITLAWB (used anyway)`));
}

function refresh(): Promise<void> {
  return (inflight ??= read()
    .then((usd) => {
      if (usd !== null) {
        usdNow = usd;
        goodAt = Date.now();
      }
    })
    .catch((err) => console.warn("[gitlawb] price read failed:", err instanceof Error ? err.message : err))
    .finally(() => {
      refreshedAt = Date.now();
      inflight = null;
    }));
}

export async function gitlawbUsd(): Promise<number | null> {
  const now = Date.now();
  if (now - refreshedAt >= FRESH_MS) {
    const p = refresh();
    // cold start: nothing to serve yet → wait briefly for the first read (bounded)
    if (goodAt === 0) await Promise.race([p, new Promise<void>((r) => setTimeout(r, COLD_WAIT_MS).unref?.())]);
  }
  return goodAt > 0 && Date.now() - goodAt <= MAX_STALE_MS ? usdNow : null;
}

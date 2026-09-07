import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { isChainKey } from "@/lib/chainPublic";
import { getCandles, getLaunch, getWalletSwaps } from "@/lib/launchpad/queries";
import { INTERVALS, isInterval, lookbackFor } from "@/lib/launchpad/candles";
import { quoteInfo } from "@/lib/launchpad/config";
import { ethUsd } from "@/lib/launchpad/ethPrice";
import { memo } from "@/lib/launchpad/memo";

export const dynamic = "force-dynamic";

/**
 * GET /api/launch/candles?chain=&token=&interval=1m|5m|15m|1h|4h|1d[&from=unix][&wallet=0x…]
 * → { interval, from, launch: {t, price}, quote: {symbol, decimals, usd}, supply, candles: RawCandle[], mine?: [...] }
 * Sparse buckets (quote per token); the client fills gaps. 3s memo per key.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = u.searchParams.get("chain");
  const token = (u.searchParams.get("token") ?? "").toLowerCase();
  const interval = u.searchParams.get("interval") ?? "5m";
  if (!isChainKey(chain) || !isAddress(token) || !isInterval(interval)) return NextResponse.json({ error: "bad params" }, { status: 400 });
  const usd = await ethUsd();
  const l = await memo(`launch:${chain}:${token}`, 3_000, () => getLaunch(chain, token, usd));
  if (!l) return NextResponse.json({ error: "not found" }, { status: 404 });
  const q = quoteInfo(chain, l.quote);
  const intervalS = INTERVALS[interval];
  const launchT = Math.floor(new Date(l.block_time).getTime() / 1000);
  const fromRaw = Number(u.searchParams.get("from"));
  const from = Number.isFinite(fromRaw) && fromRaw > 0 ? Math.max(launchT, fromRaw) : Math.max(launchT, Math.floor(Date.now() / 1000) - lookbackFor(intervalS));
  const wallet = u.searchParams.get("wallet");
  const [candles, mine] = await Promise.all([
    memo(`candles:${chain}:${token}:${interval}:${from}`, 3_000, () => getCandles(chain, token, intervalS, from, q.decimals)),
    wallet && isAddress(wallet) ? getWalletSwaps(chain, token, wallet) : Promise.resolve(null),
  ]);
  // launch price in quote per token, from the start tick
  const launchPrice = 1 / (Math.pow(1.0001, l.start_tick) * Math.pow(10, q.decimals - 18));
  return NextResponse.json(
    { interval, from, launch: { t: launchT, price: launchPrice }, quote: { symbol: q.symbol, decimals: q.decimals, usd: l.quote_usd }, supply: Number(BigInt(l.supply)) / 1e18, candles, mine },
    { headers: { "cache-control": "no-store" } },
  );
}

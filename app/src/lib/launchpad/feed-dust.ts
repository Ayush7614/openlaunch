/**
 * Dust filter for the activity feed (the home tape, the toasts, the live poll) — pure, node --test loads it directly.
 *
 * A Uniswap v4 swap can move 1 wei of quote: bots probing a pool, or a hand-typed 0.000001 USDG. Such a
 * trade is real and stays in the token's trade table, its totals and the ranking, but it is not activity
 * worth announcing — and until fmtQuoteUnits grew a floor it printed as a "0 USDG" buy. Below FEED_DUST_USD
 * a swap is dropped from the feed. A quote with no USD price right now falls back to the display floor, so
 * anything that would have read "0" is dust even while a price feed is down.
 */
import { quoteDisplayFloor, units } from "./math.ts";

/** Trades worth less than this (in dollars) never reach the feed. Tune here, nowhere else. */
export const FEED_DUST_USD = 0.01;

export type DustSwap = { usd: number | null; quote_wei: string; quote_decimals: number };

export function isDustSwap(s: DustSwap): boolean {
  // A zero or broken USD figure is "no price", not "worthless": a quote whose feed reads 0 must not vanish wholesale.
  if (s.usd !== null && Number.isFinite(s.usd) && s.usd > 0) return s.usd < FEED_DUST_USD;
  return units(s.quote_wei, s.quote_decimals) < quoteDisplayFloor(s.quote_decimals);
}

/**
 * Newest-first feed rows without dust swaps, at most `limit` of them. Launches always pass. The caller
 * over-fetches so a burst of dust cannot empty the feed.
 */
export function dropDust<T extends { kind: string }>(items: T[], limit: number): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (item.kind === "swap" && isDustSwap(item as unknown as DustSwap)) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

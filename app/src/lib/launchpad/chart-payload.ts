import type { Interval, RawCandle } from "./candles";

export type ChartPayload = {
  interval: Interval;
  from: number;
  asOf: number;
  launch: { t: number; price: number };
  baseline: { price: number; hasPriorTrades: boolean };
  quote: { symbol: string; decimals: number; usd: number | null };
  supply: number;
  candles: RawCandle[];
  mine: { t: number; is_buy: boolean; quote: string }[] | null;
};

/**
 * Reconcile snapshots for one request key. Callers must reset `current` when
 * the token, chain, range, or wallet changes. Different API memo windows can
 * return out of freshness order even when fetches themselves finish in order.
 */
export function mergeChartPayload(current: ChartPayload | null, incoming: ChartPayload, tailOnly: boolean): ChartPayload {
  // Different intervals describe different buckets and must never be stitched.
  if (!current || current.interval !== incoming.interval) return incoming;
  if (incoming.asOf < current.asOf) return current;
  if (!tailOnly) return incoming;

  return {
    ...current,
    asOf: incoming.asOf,
    quote: incoming.quote,
    supply: incoming.supply,
    mine: incoming.mine,
    // `from`, launch, and baseline remain anchored to the full history window.
    // An empty tail is still authoritative after a correction; don't retain
    // removed buckets or deduplicate wallet events by timestamp/amount.
    candles: [...current.candles.filter((bar) => bar.t < incoming.from), ...incoming.candles],
  };
}

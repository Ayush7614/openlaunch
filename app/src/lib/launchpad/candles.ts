/**
 * Pure candle logic (no imports beyond types; node --test loads this directly).
 * The DB aggregates swaps into sparse OHLCV buckets; this fills the gaps, seeds
 * the first bucket from the preceding close (or launch price), and scales prices.
 */
export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export const INTERVALS: Record<Interval, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };
export const INTERVAL_KEYS = Object.keys(INTERVALS) as Interval[];
export const MAX_CANDLE_BUCKETS = 2000;
export function isInterval(v: unknown): v is Interval {
  return typeof v === "string" && Object.hasOwn(INTERVALS, v);
}

/** One bucket as the DB returns it (prices are whole quote units per token). */
export type RawCandle = { t: number; open: number; high: number; low: number; close: number; volume: number; trades: number };
export type Candle = RawCandle & { filled?: boolean };

export function bucketStart(tsSeconds: number, intervalS: number): number {
  return Math.floor(tsSeconds / intervalS) * intervalS;
}

/**
 * A whole-bucket request, including at most MAX_CANDLE_BUCKETS through `asOf`.
 * Floor after clamping to launch so the first OHLCV bucket is never partial.
 * Missing/invalid starts use the standard lookback; future starts use this bucket.
 */
export function boundedCandleFrom(requestedFrom: number | null | undefined, launchT: number, asOf: number, intervalS: number): number {
  const end = bucketStart(asOf, intervalS);
  const requested = typeof requestedFrom === "number" && Number.isFinite(requestedFrom) && requestedFrom > 0
    ? requestedFrom
    : asOf - lookbackFor(intervalS);
  const firstAllowed = Math.max(0, bucketStart(launchT, intervalS), end - (MAX_CANDLE_BUCKETS - 1) * intervalS);
  return Math.min(end, Math.max(firstAllowed, bucketStart(requested, intervalS)));
}

/**
 * Dense series from `from` to `to` (bucket starts, inclusive). Missing buckets
 * carry the previous close as a flat candle with zero volume. `baselinePrice`
 * is the last indexed close before `from`, or the launch price if none exists.
 */
export function fillCandles(raw: RawCandle[], intervalS: number, from: number, to: number, baselinePrice: number): Candle[] {
  const byT = new Map<number, RawCandle>();
  for (const c of raw) byT.set(bucketStart(c.t, intervalS), c);
  const start = bucketStart(from, intervalS);
  const end = bucketStart(to, intervalS);
  const out: Candle[] = [];
  let prev = baselinePrice;
  for (let t = start; t <= end; t += intervalS) {
    const c = byT.get(t);
    if (c) {
      out.push({ ...c, t });
      prev = c.close;
    } else {
      out.push({ t, open: prev, high: prev, low: prev, close: prev, volume: 0, trades: 0, filled: true });
    }
  }
  return out;
}

/** Scale prices by a factor (USD per quote unit, or supply for market cap). Volume is left alone. */
export function scaleCandles(cs: Candle[], factor: number): Candle[] {
  return cs.map((c) => ({ ...c, open: c.open * factor, high: c.high * factor, low: c.low * factor, close: c.close * factor }));
}

export function highLow(cs: Candle[]): { high: number; low: number } | null {
  const real = cs.filter((c) => !c.filled);
  if (real.length === 0) return null;
  return { high: Math.max(...real.map((c) => c.high)), low: Math.min(...real.map((c) => c.low)) };
}

/** Merge a fresh tail of candles into an existing series (same interval), replacing overlapping buckets. */
export function mergeTail(existing: Candle[], tail: Candle[]): Candle[] {
  if (tail.length === 0) return existing;
  const firstT = tail[0].t;
  const kept = existing.filter((c) => c.t < firstT);
  return [...kept, ...tail];
}

/** Pick a sensible default interval for a token's age. */
export function defaultInterval(ageSeconds: number): Interval {
  if (ageSeconds < 3 * 3600) return "1m";
  if (ageSeconds < 24 * 3600) return "5m";
  if (ageSeconds < 7 * 86400) return "1h";
  return "4h";
}

/** Default lookback duration; boundedCandleFrom applies the inclusive API bucket cap. */
export function lookbackFor(intervalS: number, buckets = 300): number {
  return intervalS * buckets;
}

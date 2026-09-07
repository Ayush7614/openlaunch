/**
 * "Hot right now" ranking — pure, node --test loads this directly.
 * Inputs are the rolling stats the list already computes (trades / volume / distinct traders in the
 * last hour, holders, age). Facts only: no token can buy its way in with one wallet ping-ponging.
 */
export type TrendRow = {
  token: string;
  chain: string;
  trades_1h: number;
  traders_1h: number;
  volume_1h_usd: number | null;
  trades_24h: number;
  volume_24h_usd: number | null;
  holders: number;
  block_time: string;
};

export const STRIP_SIZE = 5; // king (2 columns) + 4 on desktop = one 6-column row
export const MIN_TRADES_1H = 3;
export const MIN_TRADERS_1H = 2;
export const MIN_STRIP = 3; // fewer eligible than this → fall back to the 24h window
export const FRESH_HOURS = 6;
export const KING_HOLD_POLLS = 2; // a challenger must lead this many consecutive polls to take the top card

/** Trades count most, then dollar volume (log-scaled so one whale buy can't dominate), holders break ties. */
export function trendingScore(r: TrendRow, nowMs: number, window: "1h" | "24h" = "1h"): number {
  const trades = window === "1h" ? r.trades_1h : r.trades_24h;
  const vol = (window === "1h" ? r.volume_1h_usd : r.volume_24h_usd) ?? 0;
  const ageH = Math.max(0, (nowMs - new Date(r.block_time).getTime()) / 3_600_000);
  const fresh = ageH < FRESH_HOURS ? 1 + (FRESH_HOURS - ageH) / FRESH_HOURS / 2 : 1; // up to 1.5× at launch, 1× after 6h
  return (trades * 10 + Math.log10(1 + vol) * 8 + Math.log10(1 + r.holders) * 3) * fresh;
}

/** Eligibility gate for the hour window: enough trades from enough distinct wallets. */
export function eligible1h(r: TrendRow): boolean {
  return r.trades_1h >= MIN_TRADES_1H && r.traders_1h >= MIN_TRADERS_1H;
}

export type Trending = { window: "1h" | "24h"; items: TrendRow[] };

/** Rank for the strip: 1h window when enough tokens qualify, else the 24h window (or nothing). */
export function rankTrending<T extends TrendRow>(rows: T[], nowMs: number, limit = STRIP_SIZE): { window: "1h" | "24h"; items: T[] } {
  const hour = rows.filter(eligible1h);
  if (hour.length >= MIN_STRIP) return { window: "1h", items: [...hour].sort((a, b) => trendingScore(b, nowMs) - trendingScore(a, nowMs)).slice(0, limit) };
  const day = rows.filter((r) => r.trades_24h >= MIN_TRADES_1H);
  if (day.length === 0) return { window: "24h", items: [] };
  return { window: "24h", items: [...day].sort((a, b) => trendingScore(b, nowMs, "24h") - trendingScore(a, nowMs, "24h")).slice(0, limit) };
}

/**
 * Sticky top card: the incumbent keeps the spot until a challenger has led `hold` consecutive polls.
 * Returns the token that should be shown as king plus the updated challenger streak.
 */
export function stickyKing(incumbent: string | null, leader: string | null, streak: { token: string | null; n: number }, hold = KING_HOLD_POLLS): { king: string | null; streak: { token: string | null; n: number } } {
  if (!leader) return { king: null, streak: { token: null, n: 0 } };
  if (!incumbent || incumbent === leader) return { king: leader, streak: { token: null, n: 0 } };
  const n = streak.token === leader ? streak.n + 1 : 1;
  if (n >= hold) return { king: leader, streak: { token: null, n: 0 } };
  return { king: incumbent, streak: { token: leader, n } };
}

/** Order the strip so the king is first while the rest keep score order. */
export function orderWithKing<T extends { token: string }>(items: T[], king: string | null): T[] {
  if (!king) return items;
  const k = items.find((i) => i.token === king);
  return k ? [k, ...items.filter((i) => i.token !== king)] : items;
}

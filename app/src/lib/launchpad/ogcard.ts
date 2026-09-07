/** Pure shaping for the per-token share card (node --test loads this). */
export type CardInput = { name: string; symbol: string; chain: "base" | "robinhood"; fdv_usd: number | null; fdv_quote: number; quote_symbol: string; change_from_launch: number; lp_fee: number; recipients: { payout: string; bps: number }[]; block_time: string };
export type Card = { title: string; symbol: string; chainLabel: string; mcap: string; change: string; up: boolean; fee: string; age: string; quote: { symbol: string; ticker: string } | null };

const DEAD = "0x000000000000000000000000000000000000dead";

function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(a >= 100 ? 0 : 2);
}

export function feeLabel(lpFee: number, recipients: { payout: string; bps: number }[]): string {
  if (lpFee === 0) return "0% fee";
  const pct = `${lpFee / 10_000}%`;
  if (recipients.length === 1 && recipients[0].payout.toLowerCase() === DEAD) return `${pct} fee, burned`;
  return `${pct} fee → beneficiary`;
}

export function ageLabel(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m old`;
  if (s < 86400) return `${Math.floor(s / 3600)}h old`;
  return `${Math.floor(s / 86400)}d old`;
}

export function shapeCard(l: CardInput, now: number): Card {
  const pct = l.change_from_launch * 100;
  return {
    title: l.name.slice(0, 28),
    symbol: l.symbol.slice(0, 12),
    chainLabel: l.chain === "base" ? "Base" : "Robinhood Chain",
    mcap: l.fdv_usd !== null ? `$${compact(l.fdv_usd)}` : `${compact(l.fdv_quote)} ${l.quote_symbol}`,
    change: `${pct >= 0 ? "+" : ""}${Math.abs(pct) >= 1000 ? compact(pct) : pct.toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%`,
    up: pct >= 0,
    fee: feeLabel(l.lp_fee, l.recipients),
    age: ageLabel(l.block_time, now),
    quote: stockQuoteOf(l.quote_symbol),
  };
}

/** Stock quotes get a "priced in" pill with a ticker tile; ETH / USDG / unknown ("?") do not. */
export function stockQuoteOf(quoteSymbol: string): Card["quote"] {
  const sym = quoteSymbol.trim();
  if (!sym || sym === "?" || sym === "ETH" || sym === "USDG") return null;
  return { symbol: sym.slice(0, 12), ticker: sym.replace(/c$/, "").toUpperCase().slice(0, 5) };
}

/** Social previews show ~125 chars: clamp on a word boundary with an ellipsis; short text is untouched. */
export const SOCIAL_DESCRIPTION_MAX = 125;
export function clampSocial(text: string, max = SOCIAL_DESCRIPTION_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max * 0.6 ? cut.slice(0, atWord) : cut).replace(/[\s,;:.\-—]+$/, "")}…`;
}

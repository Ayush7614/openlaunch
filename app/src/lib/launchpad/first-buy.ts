/**
 * The suggested first buy. Pure, node --test loads it directly.
 *
 * The launch form pre-fills a small buy (about SUGGESTED_BUY_USD in the quote asset) so a token opens with a holder and
 * a price move: with neither it reads as dead on every screener and sits under "quiet launches" on the home page.
 *
 * One rule: a SUGGESTED buy never blocks a launch. It exists only when the wallet is connected, the balances are known,
 * the quote balance covers the amount, the native balance covers the buy's gas (for an ETH quote both come from the
 * same balance), and the creator has not cleared it. In every other case the form launches for free, exactly as
 * before. An amount the creator TYPED keeps the strict checks (LaunchForm.tsx).
 */

import type { Quote } from "./config";

export const SUGGESTED_BUY_USD = 25;

/** Quick-pick amounts per quote; the first one is the suggestion (about $25 at the prices this was written at). */
export const BUY_PRESETS: Record<Quote["key"], string[]> = { eth: ["0.01", "0.05", "0.1", "0.25"], usdg: ["25", "100", "250"], gitlawb: ["500000", "1000000", "5000000"], stock: [] };

export type NoSuggestion = "no-price" | "no-wallet" | "unknown-balance" | "insufficient" | "no-gas" | "declined";
export type FirstBuySuggestion = { amount: string; reason?: undefined } | { amount: null; reason: NoSuggestion };

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** `usd` worth of a quote priced at `quoteUsd`, as a short decimal string that parseUnits accepts; null when it rounds to nothing. */
export function amountForUsd(usd: number, quoteUsd: number, decimals: number): string | null {
  if (!(usd > 0) || !(quoteUsd > 0) || !Number.isFinite(quoteUsd)) return null;
  const v = usd / quoteUsd;
  let s = v >= 1 ? v.toFixed(2) : v.toPrecision(2);
  if (/e/i.test(s)) s = v.toFixed(Math.min(decimals, 12));
  s = trimZeros(s);
  if (s === "0" || s === "") return null;
  const places = (s.split(".")[1] ?? "").length;
  if (places <= decimals) return s;
  const rounded = trimZeros(v.toFixed(decimals)); // fewer decimals than the amount needs: round to what the quote can carry
  return rounded === "0" || rounded === "" ? null : rounded;
}

/** The amount the form suggests for a quote before looking at the wallet: the first preset, or $25 worth for a stock. */
export function defaultFirstBuy(quote: Pick<Quote, "key" | "decimals" | "usd">): string | null {
  const preset = BUY_PRESETS[quote.key][0];
  if (preset) return preset;
  return quote.usd ? amountForUsd(SUGGESTED_BUY_USD, quote.usd, quote.decimals) : null;
}

export type SuggestInput = {
  quote: Pick<Quote, "key" | "decimals" | "usd">;
  connected: boolean;
  /** Wallet balance of what the buy is paid with (wei of the quote); undefined while unknown or after a failed read. */
  balance: bigint | undefined;
  /** Native balance, which pays the buy's gas (and the approvals an ERC-20 quote needs first); undefined while unknown. */
  nativeBalance: bigint | undefined;
  /** Native amount kept back for that gas. */
  gasReserve: bigint;
  /** The creator cleared the suggestion (this session). */
  declined: boolean;
  /** viem's parseUnits, injected so this module stays dependency-free for tests. */
  parse: (amount: string, decimals: number) => bigint;
};

export function suggestFirstBuy(i: SuggestInput): FirstBuySuggestion {
  if (i.declined) return { amount: null, reason: "declined" };
  const amount = defaultFirstBuy(i.quote);
  if (!amount) return { amount: null, reason: "no-price" };
  if (!i.connected) return { amount: null, reason: "no-wallet" };
  if (i.balance === undefined || i.nativeBalance === undefined) return { amount: null, reason: "unknown-balance" };
  const raw = i.parse(amount, i.quote.decimals);
  if (i.quote.key === "eth") return raw + i.gasReserve > i.balance ? { amount: null, reason: "insufficient" } : { amount };
  if (raw > i.balance) return { amount: null, reason: "insufficient" };
  if (i.nativeBalance < i.gasReserve) return { amount: null, reason: "no-gas" };
  return { amount };
}

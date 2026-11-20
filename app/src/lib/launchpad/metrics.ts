/**
 * One launch's detail figures (pure; node --test loads this): holders, supply, trades, volume and fees as the launch
 * details page and /api/launch/metrics report them. Derived from the launch read model (queries.ts `getLaunch`) and the
 * holder panel (holdersServer.ts `getHolderPanel`); nothing here reads the database or the chain.
 */
import type { LaunchRow } from "./queries";

/**
 * Every launch's token is a LaunchToken: a fixed supply of 1e9 tokens at 18 decimals. `bb_launches.supply` is in those
 * base units, which belong to the launched token — never to the quote, whose decimals differ per quote (6 for a stable,
 * 18 for ETH, HYPE or GITLAWB) and are what math.ts scales prices by, not what the supply is divided by.
 */
export const LAUNCH_TOKEN_DECIMALS = 18;

/** How many holders the page and the API list: the panel's own top ten, trimmed. */
export const TOP_HOLDERS_SHOWN = 5;

/** A launch's fee totals in USD, as `bb_launches.fees_collected_usd` and `fees_burned_usd` hold them (per fee event). */
export type LaunchFeesUsd = { collected_usd: number; burned_usd: number };

/** The facts these figures rest on, from the launch read model: the row itself carries everything else. */
export type LaunchMetricsLaunch = Pick<LaunchRow, "chain" | "token" | "name" | "symbol" | "quote_symbol" | "buys" | "sells" | "volume_usd">;

/** The facts they rest on from the holder panel (holdersServer.ts `HolderPanel`). */
export type LaunchMetricsPanel = {
  /** false while the token's transfer history is still being backfilled. */
  synced: boolean;
  holders: number;
  supply: string;
  top: readonly { address: string; balance: string; bps: number }[];
  top10Bps: number;
  poolBps: number;
};

export type LaunchMetrics = {
  chain: LaunchRow["chain"];
  token: string;
  name: string;
  symbol: string;
  /** The launch's quote asset, which its fees are collected and burned in. */
  quote_symbol: string;
  /** Distinct holders; null while the history is incomplete, because a partial count is not a count of zero. */
  holders: number | null;
  synced: boolean;
  /** The whole supply in tokens. Every launch has 1e9; the figure comes from the row rather than being assumed. */
  supply_tokens: number;
  /** Every trade the indexer holds for this launch: buys + sells, not the newest page of them. */
  trades: number;
  /** All-time volume in USD, each trade at its own hour's price; null when nothing prices the launch's quote. */
  volume_usd: number | null;
  /** Collected and burned fees in USD, the quote side only, as the indexer stored them. */
  fees_collected_usd: number;
  fees_burned_usd: number;
  /**
   * Share of supply in the ten largest non-system wallets, and in the locked pool, in basis points. Both, and the
   * ranking below, are partial while `synced` is false: show them only once the transfer history is complete.
   */
  top10Bps: number;
  poolBps: number;
  topHolders: { address: string; balance: string; bps: number }[];
};

/** A raw amount in the launched token's base units as whole tokens: exact while the integer part fits a double. */
export function supplyTokens(raw: string): number {
  const base = 10n ** BigInt(LAUNCH_TOKEN_DECIMALS);
  const v = BigInt(raw);
  return Number(v / base) + Number(v % base) / 10 ** LAUNCH_TOKEN_DECIMALS;
}

/** The figures one launch's page and API report. */
export function launchMetrics(launch: LaunchMetricsLaunch, panel: LaunchMetricsPanel, fees: LaunchFeesUsd): LaunchMetrics {
  return {
    chain: launch.chain,
    token: launch.token,
    name: launch.name,
    symbol: launch.symbol,
    quote_symbol: launch.quote_symbol,
    holders: panel.synced ? panel.holders : null,
    synced: panel.synced,
    supply_tokens: supplyTokens(panel.supply),
    trades: launch.buys + launch.sells,
    volume_usd: launch.volume_usd,
    fees_collected_usd: fees.collected_usd,
    fees_burned_usd: fees.burned_usd,
    top10Bps: panel.top10Bps,
    poolBps: panel.poolBps,
    topHolders: panel.top.slice(0, TOP_HOLDERS_SHOWN).map((h) => ({ address: h.address, balance: h.balance, bps: h.bps })),
  };
}

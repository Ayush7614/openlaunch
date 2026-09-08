/**
 * GITLAWB as a quote asset on Base — pure logic (node --test loads this directly).
 *
 * GITLAWB is Gitlawb's token: an ordinary 18-decimal ERC-20 on Base, no transfer restrictions,
 * no issuer switch. Pools quoted in it work exactly like any other ERC-20 quote (Permit2 path);
 * trading fees are paid out in GITLAWB, or burned when the launch names no beneficiary.
 *
 * USD comes from the deepest GITLAWB market: the Uniswap v4 WETH/GITLAWB pool (dynamic-fee hook,
 * tick spacing 200), read on-chain through StateView.getSlot0(poolId) and multiplied by ETH/USD.
 * Both sides are 18-dec, so no decimal adjustment. Display + sorting only, never used on-chain.
 */
import type { Address } from "viem";
import { poolIdOf, sqrtPriceToTokensPerQuote } from "./math.ts";
import { stockMcapPresets } from "./stocks.ts";

export const GITLAWB_ADDRESS = "0x5f980dcfc4c0fa3911554cf5ab288ed0eb13dba3";
export const GITLAWB_SYMBOL = "GITLAWB";
export const GITLAWB_NAME = "Gitlawb";
export const GITLAWB_DECIMALS = 18;
export const GITLAWB_SITE = "https://gitlawb.com";

/**
 * The WETH/GITLAWB v4 pool key on Base (Initialize event at block 43,202,530): a dynamic-fee pool
 * (fee 0x800000 = "the hook sets the fee"), tick spacing 200. Its id is derived, never pasted;
 * gitlawb.test.ts pins it to the on-chain id.
 */
export const GITLAWB_POOL_KEY = {
  currency0: "0x4200000000000000000000000000000000000006" as Address, // WETH
  currency1: GITLAWB_ADDRESS as Address,
  fee: 0x800000,
  tickSpacing: 200,
  hooks: "0xbb7784a4d481184283ed89619a3e3ed143e1adc0" as Address,
} as const;
export const GITLAWB_POOL_ID = poolIdOf(GITLAWB_POOL_KEY);

/** Outside this band a reading is still used but logged: spot is ~$1e-5, so either end means the pool or ETH/USD moved 1,000× or more. */
const PLAUSIBLE_USD: [number, number] = [1e-8, 1e-2];

/**
 * USD per GITLAWB from the pool's sqrtPriceX96 (GITLAWB per WETH; both 18-dec) and ETH/USD.
 * null only when an input is unusable. An implausible reading is accepted (the site must not go
 * unpriced because the token moved) but reported through `onImplausible` so it shows up in logs.
 */
export function gitlawbUsdFromSqrtPrice(sqrtPriceX96: bigint, ethUsd: number | null, onImplausible?: (usd: number) => void): number | null {
  if (ethUsd === null || !(ethUsd > 0) || sqrtPriceX96 <= 0n) return null;
  const gitlawbPerEth = sqrtPriceToTokensPerQuote(sqrtPriceX96, 18);
  if (!Number.isFinite(gitlawbPerEth) || gitlawbPerEth <= 0) return null;
  const usd = ethUsd / gitlawbPerEth;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  if (usd < PLAUSIBLE_USD[0] || usd > PLAUSIBLE_USD[1]) onImplausible?.(usd);
  return usd;
}

/** Starting-market-cap presets in whole GITLAWB for the same dollar targets the stock form uses; empty while the price is unknown. */
export function gitlawbMcapPresets(usdPrice: number | null): number[] {
  return stockMcapPresets(usdPrice ?? 0).map(Math.round);
}

/**
 * Gitlawb's logo (the white branch-and-key mark on black, as on gitlawb.com) as a rounded tile, served from
 * our own origin. `public/gitlawb-mark.png` is generated from the web repo's `public/logo.png`: strokes
 * boldened slightly so they survive 18–22px badges, cropped to the mark, 160px, transparent corners.
 */
export const GITLAWB_LOGO_PATH = "/gitlawb-mark.png";
/** The tile's ground — badges use the same black so the tile and the pill read as one piece. */
export const GITLAWB_LOGO_BG = "#000000";

export function isGitlawbAddress(address: string): boolean {
  return address.toLowerCase() === GITLAWB_ADDRESS;
}

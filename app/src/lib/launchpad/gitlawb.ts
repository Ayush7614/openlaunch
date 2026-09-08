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
export const GITLAWB_ADDRESS = "0x5f980dcfc4c0fa3911554cf5ab288ed0eb13dba3";
export const GITLAWB_SYMBOL = "GITLAWB";
export const GITLAWB_NAME = "Gitlawb";
export const GITLAWB_DECIMALS = 18;
export const GITLAWB_SITE = "https://gitlawb.com";

export const BASE_WETH = "0x4200000000000000000000000000000000000006";
/** Uniswap v4 dynamic-fee flag (fee field = 0x800000 means "the hook sets the fee"). */
export const DYNAMIC_FEE_FLAG = 0x800000;
/** The WETH/GITLAWB v4 pool key on Base (Initialize event at block 43,202,530). */
export const GITLAWB_POOL_KEY = {
  currency0: BASE_WETH,
  currency1: GITLAWB_ADDRESS,
  fee: DYNAMIC_FEE_FLAG,
  tickSpacing: 200,
  hooks: "0xbb7784a4d481184283ed89619a3e3ed143e1adc0",
} as const;
/** keccak256(abi.encode(GITLAWB_POOL_KEY)) — asserted by gitlawb.test.ts. */
export const GITLAWB_POOL_ID = "0xec33256bf1ded407a57fd3c1965e7556e42ac14db09bc4e6fef57d5e2eb0b0b9";

const Q96 = 2n ** 96n;

/**
 * USD per GITLAWB from the pool's sqrtPriceX96 (price of currency1 in currency0 = GITLAWB per WETH)
 * and ETH/USD. null when either input is unusable, or the result is absurd (a pool that is empty or
 * being manipulated must not price the site: sorting falls back to "unknown" = 0 weight).
 */
export function gitlawbUsdFromSqrtPrice(sqrtPriceX96: bigint, ethUsd: number | null): number | null {
  if (ethUsd === null || !(ethUsd > 0) || sqrtPriceX96 <= 0n) return null;
  const sqrt = Number(sqrtPriceX96) / Number(Q96);
  const gitlawbPerEth = sqrt * sqrt; // 18/18 decimals → no scaling
  if (!Number.isFinite(gitlawbPerEth) || gitlawbPerEth <= 0) return null;
  const usd = ethUsd / gitlawbPerEth;
  // sanity window: $1e-9 … $1 per GITLAWB (spot is ~$1e-5; a 1e4× move either way is not a real reading)
  if (!(usd > 1e-9 && usd < 1)) return null;
  return usd;
}

/** Starting-market-cap presets in whole GITLAWB for the usual dollar targets; empty while the price is unknown. */
export function gitlawbMcapPresets(usdPrice: number | null, usdTargets = [5_000, 10_000, 25_000, 100_000]): number[] {
  if (usdPrice === null || !(usdPrice > 0)) return [];
  return usdTargets.map((u) => Math.round(u / usdPrice));
}

/** Gitlawb mark (ring + planet + satellite) on a navy tile, as an inline data URL (same shape as the stock tiles). */
export function gitlawbTileSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0a1020"/><g transform="translate(4 4) scale(0.24)"><ellipse cx="50" cy="50" rx="44" ry="14" transform="rotate(-24 50 50)" fill="none" stroke="#e8edf6" stroke-width="5.5"/><circle cx="50" cy="50" r="25" fill="#e8edf6"/><circle cx="90.19" cy="32.1" r="8" fill="#4d7dff"/></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/%20/g, " ")}`;
}

export function isGitlawbAddress(address: string): boolean {
  return address.toLowerCase() === GITLAWB_ADDRESS;
}

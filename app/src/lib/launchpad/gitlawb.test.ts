import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { GITLAWB_ADDRESS, GITLAWB_LOGO_PATH, GITLAWB_POOL_ID, GITLAWB_POOL_KEY, gitlawbMcapPresets, gitlawbUsdFromSqrtPrice, isGitlawbAddress } from "./gitlawb.ts";

test("the derived pool id is the on-chain WETH/GITLAWB pool (Initialize at Base block 43,202,530)", () => {
  const k = GITLAWB_POOL_KEY;
  assert.equal(GITLAWB_POOL_ID, "0xec33256bf1ded407a57fd3c1965e7556e42ac14db09bc4e6fef57d5e2eb0b0b9");
  assert.equal(k.fee, 0x800000, "dynamic-fee flag");
  assert.ok(BigInt(k.currency0) < BigInt(k.currency1), "WETH sorts below GITLAWB → GITLAWB is currency1");
  assert.equal(GITLAWB_ADDRESS, GITLAWB_ADDRESS.toLowerCase(), "stored lowercase (DB quote column is lowercase)");
});

test("gitlawbUsdFromSqrtPrice: live reading ≈ $1.68e-5 at tick 188117 / ETH $2,476; rejects garbage; flags implausible", () => {
  // sqrtPriceX96 read from StateView on 2026-09-08 (tick 188117 → ~1.477e8 GITLAWB per ETH)
  const sqrt = 0x2f799c757751a02dcfbdb3537a4an;
  const flagged: number[] = [];
  const usd = gitlawbUsdFromSqrtPrice(sqrt, 2476, (v) => flagged.push(v));
  assert.ok(usd !== null);
  assert.ok(Math.abs(usd - 1.676e-5) / 1.676e-5 < 0.01, `≈ $1.676e-5, got ${usd}`);
  assert.deepEqual(flagged, [], "a normal reading is not flagged");
  assert.equal(gitlawbUsdFromSqrtPrice(sqrt, null), null, "no ETH price → no USD");
  assert.equal(gitlawbUsdFromSqrtPrice(0n, 2476), null, "zero price");
  assert.equal(gitlawbUsdFromSqrtPrice(-1n, 2476), null, "negative");
  const big = gitlawbUsdFromSqrtPrice(2n ** 96n, 2476, (v) => flagged.push(v));
  assert.equal(big, 2476, "1 GITLAWB = 1 ETH is still a reading…");
  assert.deepEqual(flagged, [2476], "…but it is reported as implausible");
});

test("presets convert dollar targets into GITLAWB units; empty without a price", () => {
  assert.deepEqual(gitlawbMcapPresets(null), []);
  assert.deepEqual(gitlawbMcapPresets(0), []);
  const p = gitlawbMcapPresets(0.00002);
  assert.deepEqual(p, [250_000_000, 500_000_000, 1_250_000_000, 5_000_000_000], "same $5K/$10K/$25K/$100K ladder as stocks, in whole GITLAWB");
});

test("logo asset ships with the app; address check is case-insensitive", () => {
  assert.ok(GITLAWB_LOGO_PATH.startsWith("/"), "same-origin path");
  assert.ok(existsSync(new URL(`../../../public${GITLAWB_LOGO_PATH}`, import.meta.url)), "public/gitlawb-mark.png exists");
  assert.ok(isGitlawbAddress("0x5F980Dcfc4c0fa3911554cf5ab288ed0eb13DBa3"));
  assert.ok(!isGitlawbAddress("0x5F980Dcfc4c0fa3911554cf5ab288ed0eb13DBa4"));
});

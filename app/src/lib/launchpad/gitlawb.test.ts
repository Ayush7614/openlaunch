import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, keccak256 } from "viem";
import { DYNAMIC_FEE_FLAG, GITLAWB_ADDRESS, GITLAWB_POOL_ID, GITLAWB_POOL_KEY, gitlawbMcapPresets, gitlawbTileSvg, gitlawbUsdFromSqrtPrice, isGitlawbAddress } from "./gitlawb.ts";

test("pool id = keccak256(abi.encode(poolKey)) for the WETH/GITLAWB dynamic-fee pool", () => {
  const k = GITLAWB_POOL_KEY;
  const id = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [k.currency0 as `0x${string}`, k.currency1 as `0x${string}`, k.fee, k.tickSpacing, k.hooks as `0x${string}`],
    ),
  );
  assert.equal(id, GITLAWB_POOL_ID);
  assert.equal(k.fee, DYNAMIC_FEE_FLAG);
  assert.ok(BigInt(k.currency0) < BigInt(k.currency1), "WETH sorts below GITLAWB → GITLAWB is currency1");
  assert.equal(GITLAWB_ADDRESS, GITLAWB_ADDRESS.toLowerCase(), "stored lowercase (DB quote column is lowercase)");
});

test("gitlawbUsdFromSqrtPrice: live reading ≈ $1.68e-5 at tick 188117 / ETH $2,476; rejects garbage", () => {
  // sqrtPriceX96 read from StateView on 2026-09-08 (tick 188117 → ~1.477e8 GITLAWB per ETH)
  const sqrt = 0x2f799c757751a02dcfbdb3537a4an;
  const usd = gitlawbUsdFromSqrtPrice(sqrt, 2476);
  assert.ok(usd !== null);
  assert.ok(Math.abs(usd - 1.676e-5) / 1.676e-5 < 0.01, `≈ $1.676e-5, got ${usd}`);
  assert.equal(gitlawbUsdFromSqrtPrice(sqrt, null), null, "no ETH price → no USD");
  assert.equal(gitlawbUsdFromSqrtPrice(0n, 2476), null, "zero price");
  assert.equal(gitlawbUsdFromSqrtPrice(-1n, 2476), null, "negative");
  assert.equal(gitlawbUsdFromSqrtPrice(2n ** 96n, 2476), null, "1 GITLAWB = 1 ETH is outside the sanity window");
  assert.equal(gitlawbUsdFromSqrtPrice(2n ** 96n * 10n ** 9n, 2476), null, "absurdly cheap is rejected too");
});

test("presets convert dollar targets into GITLAWB units; empty without a price", () => {
  assert.deepEqual(gitlawbMcapPresets(null), []);
  assert.deepEqual(gitlawbMcapPresets(0), []);
  const p = gitlawbMcapPresets(0.00002);
  assert.deepEqual(p, [250_000_000, 500_000_000, 1_250_000_000, 5_000_000_000]);
});

test("tile is an inline SVG data URL; address check is case-insensitive", () => {
  const t = gitlawbTileSvg();
  assert.ok(t.startsWith("data:image/svg+xml,"));
  assert.ok(decodeURIComponent(t).includes("<ellipse"));
  assert.ok(isGitlawbAddress("0x5F980Dcfc4c0fa3911554cf5ab288ed0eb13DBa3"));
  assert.ok(!isGitlawbAddress("0x5F980Dcfc4c0fa3911554cf5ab288ed0eb13DBa4"));
});

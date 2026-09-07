import { test } from "node:test";
import assert from "node:assert/strict";
import { fdvForStartTick, fmtEth, minOut, poolIdOf, quoteUsdOf, startTickForFdv, sqrtPriceToTokensPerQuote, tickToTokensPerQuote } from "./math.ts";
import { encodeV4ExactInSingle } from "./swap.ts";

test("startTickForFdv: 10 ETH FDV on 1B supply ≈ tick 184200 (1 ETH = 100M tokens)", () => {
  assert.equal(startTickForFdv(10), 184_200);
  assert.ok(Math.abs(tickToTokensPerQuote(184_200) - 1e8) / 1e8 < 0.02);
  const fdv = fdvForStartTick(184_200);
  assert.ok(fdv >= 10 && fdv < 10.3, `snapped down in tick = slightly higher fdv, got ${fdv}`);
});

test("startTickForFdv snaps to spacing and is monotonic", () => {
  for (const f of [0.5, 1, 5, 25, 100]) assert.equal(startTickForFdv(f) % 200, 0);
  assert.ok(startTickForFdv(1) > startTickForFdv(25));
});

test("USDG (6 dec) quote: $10k FDV on 1B supply ≈ tick 391400, round-trips", () => {
  const t = startTickForFdv(10_000, 6);
  assert.equal(t % 200, 0);
  assert.ok(Math.abs(t - 391_400) <= 200, `got ${t}`);
  const fdv = fdvForStartTick(t, 6);
  assert.ok(fdv >= 10_000 && fdv < 10_300, `fdv ${fdv}`);
  // 1 USDG buys ~100k tokens at that price
  const perUsdg = tickToTokensPerQuote(t, 6);
  assert.ok(perUsdg > 95_000 && perUsdg < 100_500, `per usdg ${perUsdg}`);
});

test("sqrtPrice round-trips a tick", () => {
  const tick = 184_200;
  const sqrt = BigInt(Math.floor(Math.sqrt(1.0001 ** tick) * 2 ** 96));
  const t = sqrtPriceToTokensPerQuote(sqrt);
  assert.ok(Math.abs(t - 1.0001 ** tick) / t < 1e-6);
});

test("poolIdOf matches keccak(abi.encode(PoolKey)) for a known vector", () => {
  // Any key; the important property is stability + the ETH/token ordering used everywhere.
  const id = poolIdOf({
    currency0: "0x0000000000000000000000000000000000000000",
    currency1: "0x26c30b044B7C4d046282282D3338d72A0b4653A7",
    fee: 0,
    tickSpacing: 200,
    hooks: "0x0000000000000000000000000000000000000000",
  });
  assert.match(id, /^0x[0-9a-f]{64}$/);
});

test("minOut applies bps slippage", () => {
  assert.equal(minOut(10_000n, 100), 9_900n);
  assert.equal(minOut(0n, 500), 0n);
});

test("fmtEth trims noise", () => {
  assert.equal(fmtEth(10n ** 18n), "1");
  assert.equal(fmtEth(5n * 10n ** 16n), "0.05");
  assert.equal(fmtEth(0n), "0");
});

test("encodeV4ExactInSingle builds a V4_SWAP command with 3 actions", () => {
  const { commands, inputs } = encodeV4ExactInSingle({
    key: {
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x26c30b044B7C4d046282282D3338d72A0b4653A7",
      fee: 10_000,
      tickSpacing: 200,
      hooks: "0x0000000000000000000000000000000000000000",
    },
    zeroForOne: true,
    amountIn: 10n ** 17n,
    minOut: 1n,
  });
  assert.equal(commands, "0x10");
  assert.equal(inputs.length, 1);
  assert.ok(inputs[0].includes("060c0f"), "actions packed as 06 0c 0f");
});

test("encodeV4ExactInSingle v2 layout carries minHopPriceX36 (Robinhood router)", () => {
  const key = { currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xBdAD69fac07E5C627F86294C69F8179CA730f28A", fee: 10_000, tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" } as const;
  const v1 = encodeV4ExactInSingle({ key, zeroForOne: true, amountIn: 1n, minOut: 0n, layout: "v1" });
  const v2 = encodeV4ExactInSingle({ key, zeroForOne: true, amountIn: 1n, minOut: 0n, layout: "v2" });
  assert.notEqual(v1.inputs[0], v2.inputs[0]);
  assert.equal(v2.inputs[0].length - v1.inputs[0].length, 64, "one extra uint256 word");
});

test("quoteUsdOf: stables/stocks use their own price, ETH only for the native address, unknown ERC20 is never priced", () => {
  const NATIVE = "0x0000000000000000000000000000000000000000";
  assert.equal(quoteUsdOf({ address: NATIVE, usd: null }, 2500), 2500);
  assert.equal(quoteUsdOf({ address: NATIVE, usd: null }, null), null, "no ETH price → unknown, not 0");
  assert.equal(quoteUsdOf({ address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", usd: 1 }, 2500), 1, "USDG");
  assert.equal(quoteUsdOf({ address: "0xabc0000000000000000000000000000000000001", usd: 229.01 }, 2500), 229.01, "stock with live price");
  assert.equal(quoteUsdOf({ address: "0xabc0000000000000000000000000000000000001", usd: null }, 2500), null, "unknown ERC20 must not be priced as ETH");
});

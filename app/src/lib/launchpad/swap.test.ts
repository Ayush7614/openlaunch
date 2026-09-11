import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeAbiParameters } from "viem";
import { ACTION_SETTLE_ALL, ACTION_SWAP_EXACT_IN_SINGLE, ACTION_TAKE_ALL, encodeV4ExactInSingle, UR_COMMAND_V4_SWAP, type PoolKey } from "./swap.ts";

const KEY = {
  currency0: "0x0000000000000000000000000000000000000000",
  currency1: "0x26c30b044b7c4d046282282d3338d72a0b4653a7",
  fee: 10_000,
  tickSpacing: 200,
  hooks: "0x0000000000000000000000000000000000000000",
} as const as PoolKey;

/** Decode the outer inputs[0] = abi.encode(actions, [swapParams, settle, take]). */
function decodeInput(input: `0x${string}`) {
  const [actions, params] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], input);
  return { actions: actions as `0x${string}`, params: params as `0x${string}`[] };
}

function decodePair(raw: `0x${string}`) {
  const [currency, amount] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], raw);
  return { currency: (currency as string).toLowerCase(), amount: amount as bigint };
}

test("command and action constants match the Universal Router / v4 router", () => {
  assert.equal(UR_COMMAND_V4_SWAP, 0x10);
  assert.equal(ACTION_SWAP_EXACT_IN_SINGLE, 0x06);
  assert.equal(ACTION_SETTLE_ALL, 0x0c);
  assert.equal(ACTION_TAKE_ALL, 0x0f);
});

test("buy (zeroForOne): ETH in, token out; settle carries amountIn, take carries minOut", () => {
  const amountIn = 10n ** 17n;
  const minOut = 123n;
  const { commands, inputs } = encodeV4ExactInSingle({ key: KEY, zeroForOne: true, amountIn, minOut });
  assert.equal(commands, "0x10");
  assert.equal(inputs.length, 1);
  const { actions, params } = decodeInput(inputs[0]);
  assert.equal(actions.toLowerCase(), "0x060c0f", "SWAP_EXACT_IN_SINGLE ‖ SETTLE_ALL ‖ TAKE_ALL");
  assert.equal(params.length, 3);
  assert.deepEqual(decodePair(params[1]), { currency: KEY.currency0, amount: amountIn });
  assert.deepEqual(decodePair(params[2]), { currency: KEY.currency1, amount: minOut });
});

test("sell (!zeroForOne) flips the currencies", () => {
  const amountIn = 5n * 10n ** 18n;
  const minOut = 7n;
  const { inputs } = encodeV4ExactInSingle({ key: KEY, zeroForOne: false, amountIn, minOut });
  const { params } = decodeInput(inputs[0]);
  assert.deepEqual(decodePair(params[1]), { currency: KEY.currency1, amount: amountIn }, "settle the token");
  assert.deepEqual(decodePair(params[2]), { currency: KEY.currency0, amount: minOut }, "take the quote");
});

test("zero amounts round-trip (quoter has not priced yet)", () => {
  const { inputs } = encodeV4ExactInSingle({ key: KEY, zeroForOne: true, amountIn: 0n, minOut: 0n });
  const { params } = decodeInput(inputs[0]);
  assert.deepEqual(decodePair(params[1]).amount, 0n);
  assert.deepEqual(decodePair(params[2]).amount, 0n);
});

test("uint128-scale amounts survive the encoding", () => {
  const big = (1n << 127n) + 12345n;
  const { inputs } = encodeV4ExactInSingle({ key: KEY, zeroForOne: true, amountIn: big, minOut: big });
  const { params } = decodeInput(inputs[0]);
  assert.deepEqual(decodePair(params[1]).amount, big);
  assert.deepEqual(decodePair(params[2]).amount, big);
});

test("v1 is the default layout; v2 carries one extra uint256 word", () => {
  const a = encodeV4ExactInSingle({ key: KEY, zeroForOne: true, amountIn: 1n, minOut: 0n });
  const b = encodeV4ExactInSingle({ key: KEY, zeroForOne: true, amountIn: 1n, minOut: 0n, layout: "v1" });
  const c = encodeV4ExactInSingle({ key: KEY, zeroForOne: true, amountIn: 1n, minOut: 0n, layout: "v2" });
  assert.equal(a.inputs[0], b.inputs[0]);
  assert.equal(c.inputs[0].length - a.inputs[0].length, 64, "minHopPriceX36 word");
});

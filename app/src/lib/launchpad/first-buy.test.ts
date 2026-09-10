import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "viem";
import { BUY_PRESETS, SUGGESTED_BUY_USD, amountForUsd, defaultFirstBuy, suggestFirstBuy } from "./first-buy.ts";

const eth = { key: "eth" as const, decimals: 18, usd: null };
const usdg = { key: "usdg" as const, decimals: 6, usd: 1 };
const gitlawb = { key: "gitlawb" as const, decimals: 18, usd: 0.00002 };
const nvda = { key: "stock" as const, decimals: 18, usd: 223.05 };
const GAS = parseUnits("0.0005", 18);
const base = { connected: true, declined: false, parse: parseUnits };

test("default: the first preset for ETH, USDG and GITLAWB; $25 worth for a stock; nothing for a stock without a price", () => {
  assert.equal(defaultFirstBuy(eth), BUY_PRESETS.eth[0]);
  assert.equal(defaultFirstBuy(usdg), "25");
  assert.equal(defaultFirstBuy(gitlawb), "500000");
  assert.equal(defaultFirstBuy(nvda), "0.11", `${SUGGESTED_BUY_USD} / 223.05`);
  assert.equal(defaultFirstBuy({ ...nvda, usd: null }), null);
});

test("amountForUsd: short decimals parseUnits accepts, never more places than the quote has, null when it rounds away", () => {
  assert.equal(amountForUsd(25, 2500, 18), "0.01");
  assert.equal(amountForUsd(25, 1, 6), "25");
  assert.equal(amountForUsd(25, 0.00002, 18), "1250000");
  assert.equal(amountForUsd(25, 120000, 18), "0.00021");
  assert.equal(amountForUsd(25, 3, 0), "8", "a 0-decimal quote gets a whole number");
  assert.equal(amountForUsd(25, 1e12, 2), null, "rounds to nothing at 2 decimals");
  assert.equal(amountForUsd(0, 1, 6), null);
  assert.equal(amountForUsd(25, 0, 6), null);
  for (const [usd, dec] of [[2464.485, 18], [223.05, 18], [0.0000195, 18], [1, 6]] as const) {
    const a = amountForUsd(25, usd, dec)!;
    assert.ok(parseUnits(a, dec) > 0n, `parseUnits accepts ${a}`);
  }
});

test("suggestFirstBuy: only when connected, balance known and enough for amount + gas; every other case launches free", () => {
  const enough = parseUnits("0.02", 18);
  assert.deepEqual(suggestFirstBuy({ ...base, quote: eth, balance: enough, gasReserve: GAS }), { amount: "0.01" });
  assert.deepEqual(suggestFirstBuy({ ...base, quote: eth, balance: parseUnits("0.0104", 18), gasReserve: GAS }), { amount: null, reason: "insufficient" }, "covers the amount but not the gas reserve");
  assert.deepEqual(suggestFirstBuy({ ...base, quote: eth, balance: undefined, gasReserve: GAS }), { amount: null, reason: "unknown-balance" }, "a failed or pending balance read never blocks");
  assert.deepEqual(suggestFirstBuy({ ...base, quote: eth, connected: false, balance: undefined, gasReserve: GAS }), { amount: null, reason: "no-wallet" });
  assert.deepEqual(suggestFirstBuy({ ...base, quote: eth, balance: enough, gasReserve: GAS, declined: true }), { amount: null, reason: "declined" });
  assert.deepEqual(suggestFirstBuy({ ...base, quote: { ...nvda, usd: null }, balance: enough, gasReserve: 0n }), { amount: null, reason: "no-price" });
  assert.deepEqual(suggestFirstBuy({ ...base, quote: usdg, balance: parseUnits("25", 6), gasReserve: 0n }), { amount: "25" }, "ERC-20 quote: exact balance is enough, gas is paid in ETH");
  assert.deepEqual(suggestFirstBuy({ ...base, quote: usdg, balance: parseUnits("24.99", 6), gasReserve: 0n }), { amount: null, reason: "insufficient" });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "viem";
import { BUY_PRESETS, SUGGESTED_BUY_USD, amountForUsd, defaultFirstBuy, suggestFirstBuy } from "./first-buy.ts";

const eth = { key: "eth" as const, decimals: 18, usd: null };
const usdg = { key: "usdg" as const, decimals: 6, usd: 1 };
const gitlawb = { key: "gitlawb" as const, decimals: 18, usd: 0.00002 };
const nvda = { key: "stock" as const, decimals: 18, usd: 223.05 };
const GAS = parseUnits("0.0015", 18); // the form's reserve: launch gas + buy gas
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
  assert.equal(amountForUsd(25, 100, 0), null, "a 0-decimal quote where $25 is less than one unit: no suggestion, not \"0\"");
  assert.equal(amountForUsd(25, 3000, 2), "0.01");
  assert.equal(amountForUsd(25, 30000, 2), null, "rounds to 0.00 at 2 decimals");
  assert.equal(amountForUsd(25, 1e12, 2), null, "rounds to nothing at 2 decimals");
  assert.equal(amountForUsd(0, 1, 6), null);
  assert.equal(amountForUsd(25, 0, 6), null);
  for (const [usd, dec] of [[2464.485, 18], [223.05, 18], [0.0000195, 18], [1, 6]] as const) {
    const a = amountForUsd(25, usd, dec)!;
    assert.ok(parseUnits(a, dec) > 0n, `parseUnits accepts ${a}`);
  }
});

test("suggestFirstBuy (ETH quote): only when connected and the balance is known and covers amount + gas; every other case launches free", () => {
  const enough = parseUnits("0.02", 18);
  const ethIn = (balance: bigint | undefined, more = {}) => suggestFirstBuy({ ...base, quote: eth, balance, nativeBalance: balance, gasReserve: GAS, ...more });
  assert.deepEqual(ethIn(enough), { amount: "0.01" });
  assert.deepEqual(ethIn(parseUnits("0.0114", 18)), { amount: null, reason: "insufficient" }, "covers the amount and the buy's gas but not the launch's");
  assert.deepEqual(ethIn(parseUnits("0.0115", 18)), { amount: "0.01" }, "exactly amount + both reserves");
  assert.deepEqual(ethIn(undefined), { amount: null, reason: "unknown-balance" }, "a failed or pending balance read never blocks");
  assert.deepEqual(ethIn(undefined, { connected: false }), { amount: null, reason: "no-wallet" });
  assert.deepEqual(ethIn(enough, { declined: true }), { amount: null, reason: "declined" });
  assert.deepEqual(suggestFirstBuy({ ...base, quote: { ...nvda, usd: null }, balance: enough, nativeBalance: enough, gasReserve: 0n }), { amount: null, reason: "no-price" });
});

test("suggestFirstBuy (ERC-20 quote): the token balance must cover the amount and the native balance must cover the gas", () => {
  const usdgIn = (balance: bigint | undefined, nativeBalance: bigint | undefined) => suggestFirstBuy({ ...base, quote: usdg, balance, nativeBalance, gasReserve: GAS });
  assert.deepEqual(usdgIn(parseUnits("25", 6), GAS), { amount: "25" }, "exact token balance is enough; gas is separate");
  assert.deepEqual(usdgIn(parseUnits("24.99", 6), GAS), { amount: null, reason: "insufficient" });
  assert.deepEqual(usdgIn(parseUnits("100", 6), GAS - 1n), { amount: null, reason: "no-gas" }, "tokens, but one wei short of gas for the launch, the approvals and the swap");
  assert.deepEqual(usdgIn(parseUnits("100", 6), GAS), { amount: "25" }, "exactly the reserve");
  assert.deepEqual(usdgIn(parseUnits("100", 6), undefined), { amount: null, reason: "unknown-balance" }, "native balance unknown: no suggestion, launch stays free");
  assert.deepEqual(usdgIn(undefined, GAS), { amount: null, reason: "unknown-balance" });
  assert.deepEqual(suggestFirstBuy({ ...base, quote: nvda, balance: parseUnits("1", 18), nativeBalance: GAS, gasReserve: GAS }), { amount: "0.11" });
});

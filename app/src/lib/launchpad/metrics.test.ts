import { test } from "node:test";
import assert from "node:assert/strict";
import { LAUNCH_TOKEN_DECIMALS, TOP_HOLDERS_SHOWN, launchMetrics, supplyTokens, type LaunchMetricsLaunch, type LaunchMetricsPanel } from "./metrics.ts";

const TOKEN = "0x" + "a".repeat(40);
/** 1e9 tokens at 18 decimals: the supply every LaunchToken has. */
const SUPPLY = "1000000000000000000000000000";

const launch = (o: Partial<LaunchMetricsLaunch> = {}): LaunchMetricsLaunch => ({ chain: "base", token: TOKEN, name: "Test", symbol: "TEST", quote_symbol: "ETH", buys: 7, sells: 3, volume_usd: 1234.5, ...o });

const topN = (n: number) => Array.from({ length: n }, (_, i) => ({ address: `0x${String(i).padStart(4, "0")}${"b".repeat(36)}`, balance: "1000", bps: 500 }));

const panel = (o: Partial<LaunchMetricsPanel> = {}): LaunchMetricsPanel => ({ synced: true, holders: 42, supply: SUPPLY, top: topN(10), top10Bps: 4200, poolBps: 5800, ...o });

const fees = { collected_usd: 12.5, burned_usd: 3.25 };

test("supply is scaled by the launched token's 18 decimals, not the quote's", () => {
  assert.equal(LAUNCH_TOKEN_DECIMALS, 18);
  assert.equal(supplyTokens(SUPPLY), 1_000_000_000);
  assert.equal(supplyTokens("1500000000000000000"), 1.5);
  // the quote is USDG at 6 decimals here: the supply is the token's own and does not move with it
  const m = launchMetrics(launch({ quote_symbol: "USDG" }), panel(), fees);
  assert.equal(m.supply_tokens, 1_000_000_000);
});

test("trades are the launch's whole count, not the newest page of swaps", () => {
  assert.equal(launchMetrics(launch({ buys: 7, sells: 3 }), panel(), fees).trades, 10);
});

test("holders are reported only once the transfer history is complete", () => {
  assert.equal(launchMetrics(launch(), panel(), fees).holders, 42);
  const indexing = launchMetrics(launch(), panel({ synced: false, holders: 3 }), fees);
  assert.equal(indexing.holders, null, "a partial backfill is not a count of zero");
  assert.equal(indexing.synced, false);
});

test("volume and fees are the stored USD figures, and an unpriced launch keeps a null volume", () => {
  const m = launchMetrics(launch(), panel(), fees);
  assert.equal(m.volume_usd, 1234.5);
  assert.equal(m.fees_collected_usd, 12.5);
  assert.equal(m.fees_burned_usd, 3.25);
  assert.equal(launchMetrics(launch({ volume_usd: null }), panel(), fees).volume_usd, null);
});

test("the top holders are the panel's first five, named as the panel names them", () => {
  const m = launchMetrics(launch(), panel(), fees);
  assert.equal(TOP_HOLDERS_SHOWN, 5);
  assert.deepEqual(m.topHolders.map((h) => h.address), topN(5).map((h) => h.address));
  assert.equal(m.top10Bps, 4200);
  assert.equal(m.poolBps, 5800);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRegistry, searchStocks, stockMcapPresets, stockUsd } from "./stocks.ts";

const reg = (over: Record<string, unknown> = {}) => ({
  tokenSymbol: "AAPL",
  tokenName: "Apple • Robinhood Token",
  deployments: [{ contractAddress: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", chainId: 4663, networkName: "Robinhood Chain" }],
  currentMultiplier: "1.000566080061092436",
  status: "ASSET_STATUS_ACTIVE",
  tokenDecimals: 18,
  logoUrl: "https://cdn.example/aapl.png",
  ...over,
});

test("parseRegistry keeps only active 4663 deployments with sane fields", () => {
  const [a] = parseRegistry([reg()]);
  assert.equal(a.address, "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9");
  assert.equal(a.symbol, "AAPL");
  assert.equal(a.name, "Apple");
  assert.equal(a.decimals, 18);
  assert.ok(Math.abs(a.multiplier - 1.00056608) < 1e-6);
  assert.equal(a.logo, "https://cdn.example/aapl.png");
  assert.equal(parseRegistry([reg({ status: "ASSET_STATUS_DELISTED" })]).length, 0);
  assert.equal(parseRegistry([reg({ deployments: [{ contractAddress: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", chainId: 8453 }] })]).length, 0, "other chain");
  assert.equal(parseRegistry([reg({ deployments: [{ contractAddress: "not-an-address", chainId: 4663 }] })]).length, 0);
  assert.equal(parseRegistry([reg({ tokenSymbol: "<script>" })]).length, 0);
  assert.equal(parseRegistry([reg({ currentMultiplier: "0" })]).length, 0);
  assert.equal(parseRegistry([reg({ logoUrl: "http://insecure/x.png" })])[0].logo, null);
  assert.equal(parseRegistry([reg(), reg()]).length, 1, "dedupe by address");
  assert.equal(parseRegistry({ assets: [reg()] }).length, 1, "wrapped payload");
  assert.equal(parseRegistry("garbage").length, 0);
});

test("stockUsd = mid(bid, ask) × multiplier; null on garbage or crossed quotes", () => {
  assert.equal(stockUsd({ bid: "300", ask: "320" }, 1), 310);
  assert.ok(Math.abs(stockUsd({ bid: "300", ask: "320" }, 1.0005)! - 310.155) < 1e-9);
  assert.equal(stockUsd({ bid: "300" }, 1), 300, "one side is enough");
  assert.equal(stockUsd({ bid: "0", ask: "0" }, 1), null);
  assert.equal(stockUsd({ bid: "320", ask: "300" }, 1), null, "crossed");
  assert.equal(stockUsd(null, 1), null);
});

test("searchStocks: symbol prefix first, then substring; presets in stock units", () => {
  const list = parseRegistry([reg(), reg({ tokenSymbol: "AAPU", tokenName: "Apple Bull 2x", deployments: [{ contractAddress: "0x1111111111111111111111111111111111111111", chainId: 4663 }] }), reg({ tokenSymbol: "TSLA", tokenName: "Tesla", deployments: [{ contractAddress: "0x2222222222222222222222222222222222222222", chainId: 4663 }] })]);
  assert.deepEqual(searchStocks(list, "aa").map((s) => s.symbol), ["AAPL", "AAPU"]);
  assert.deepEqual(searchStocks(list, "tesla").map((s) => s.symbol), ["TSLA"]);
  assert.deepEqual(searchStocks(list, "$TS").map((s) => s.symbol), ["TSLA"]);
  assert.equal(searchStocks(list, "").length, 3);
  assert.deepEqual(stockMcapPresets(250, [5_000, 25_000]), [20, 100]);
  assert.deepEqual(stockMcapPresets(0), []);
});

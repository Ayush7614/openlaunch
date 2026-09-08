import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeChartPayload, type ChartPayload } from "./chart-payload.ts";

const bar = (t: number, close = 1) => ({ t, open: close, high: close, low: close, close, volume: 5, trades: 1 });
function payload(overrides: Partial<ChartPayload> = {}): ChartPayload {
  return {
    interval: "1m", from: 60, asOf: 240,
    launch: { t: 60, price: .5 }, baseline: { price: .5, hasPriorTrades: false },
    quote: { symbol: "ETH", decimals: 18, usd: 2000 }, supply: 1e9,
    candles: [bar(60), bar(120), bar(180)],
    mine: [{ t: 120, is_buy: true, quote: "100" }],
    ...overrides,
  };
}

test("chart payload ignores older same-interval snapshots for full and tail requests", () => {
  const current = payload();
  const older = payload({ asOf: 239, candles: [] });
  assert.equal(mergeChartPayload(current, older, false), current);
  assert.equal(mergeChartPayload(current, older, true), current);
});

test("an empty corrected tail removes overlapping old buckets while preserving earlier history", () => {
  const current = payload();
  const incoming = payload({ from: 120, asOf: 300, candles: [], mine: [] });
  const merged = mergeChartPayload(current, incoming, true);
  assert.deepEqual(merged.candles, [bar(60)]);
  assert.deepEqual(merged.mine, []);
  assert.equal(merged.asOf, 300);
});

test("tail merge retains the full-window baseline and replaces current quote metadata", () => {
  const current = payload();
  const incoming = payload({ from: 180, asOf: 300, candles: [bar(180, 2), bar(240, 3)],
    baseline: { price: 8, hasPriorTrades: true }, quote: { symbol: "ETH", decimals: 18, usd: 2100 }, supply: 2e9 });
  const originalCurrent = structuredClone(current);
  const originalIncoming = structuredClone(incoming);
  const merged = mergeChartPayload(current, incoming, true);
  assert.equal(merged.from, current.from);
  assert.equal(merged.baseline, current.baseline);
  assert.equal(merged.launch, current.launch);
  assert.deepEqual(merged.candles, [bar(60), bar(120), bar(180, 2), bar(240, 3)]);
  assert.equal(merged.quote, incoming.quote);
  assert.equal(merged.supply, incoming.supply);
  assert.deepEqual(current, originalCurrent, "does not mutate current data");
  assert.deepEqual(incoming, originalIncoming, "does not mutate incoming data");
});

test("tail markers replace the full wallet snapshot without dropping identical real events", () => {
  const current = payload();
  const trade = { t: 240, is_buy: false, quote: "100" };
  const incoming = payload({ from: 180, asOf: 300, mine: [trade, trade] });
  assert.deepEqual(mergeChartPayload(current, incoming, true).mine, [trade, trade]);
  assert.equal(mergeChartPayload(current, { ...incoming, mine: null }, true).mine, null);
});

test("newer full snapshots replace the complete range and equal-second corrections are accepted", () => {
  const current = payload();
  const incoming = payload({ from: 120, asOf: 300, baseline: { price: 2, hasPriorTrades: true }, candles: [bar(120, 2)] });
  assert.equal(mergeChartPayload(current, incoming, false), incoming);
  const sameSecond = payload({ asOf: current.asOf, candles: [] });
  assert.equal(mergeChartPayload(current, sameSecond, false), sameSecond);
  assert.deepEqual(mergeChartPayload(current, sameSecond, true).candles, []);
});

test("initial and interval-mismatched payloads replace instead of tail-merging incompatible buckets", () => {
  const current = payload();
  const incoming = payload({ interval: "5m", from: 0, asOf: 239, candles: [bar(0, 2)] });
  assert.equal(mergeChartPayload(null, incoming, true), incoming);
  assert.equal(mergeChartPayload(current, incoming, true), incoming);
  assert.equal(mergeChartPayload(current, incoming, false), incoming);
});

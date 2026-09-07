import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERVALS, scaleCandles, type Candle } from "./candles.ts";
import { aggregateWalletMarkers, chartRangeSelection, formatChartAxis, formatChartPrice, selectedRangeStats, type WalletChartMarker } from "./chart-terminal.ts";

test("chart ranges choose useful intervals and never request before launch", () => {
  const now = 100 * 86400;
  assert.deepEqual(chartRangeSelection("1d", 0, now), { interval: "5m", from: now - 86400 });
  assert.deepEqual(chartRangeSelection("7d", 0, now), { interval: "1h", from: now - 7 * 86400 });
  assert.deepEqual(chartRangeSelection("30d", 0, now), { interval: "4h", from: now - 30 * 86400 });
  for (const range of ["1d", "7d", "30d"] as const) assert.equal(chartRangeSelection(range, now - 60, now).from, now - 60);
  assert.deepEqual(chartRangeSelection("auto", now - 600, now), { interval: "1m", from: undefined });
});

test("All chooses the finest interval that contains at most 1,500 inclusive buckets", () => {
  for (const [launch, now, expected] of [[0, 1499 * 60, "1m"], [0, 1500 * 60, "5m"], [59, 1500 * 60, "5m"], [0, 90 * 86400, "4h"], [0, 365 * 86400, "1d"]] as const) {
    const result = chartRangeSelection("all", launch, now);
    assert.equal(result.interval, expected);
    assert.equal(result.from, launch);
    const seconds = INTERVALS[result.interval];
    assert.ok(Math.floor(now / seconds) - Math.floor(launch / seconds) + 1 <= 1500);
  }
  assert.deepEqual(chartRangeSelection("all", 0, 2000 * 86400), { interval: "1d", from: 0 }, "coarsest resolution keeps the requested lifetime; API capacity remains explicit");
});

test("chart formatting handles both signs, compact large values, and nonfinite data", () => {
  assert.equal(formatChartPrice(120_000_000, true), "120M");
  assert.equal(formatChartPrice(-120_000_000, true), "-120M");
  assert.equal(formatChartPrice(12.1234567), "12.123457");
  assert.equal(formatChartPrice(0), "0");
  assert.equal(formatChartPrice(-0), "0");
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(formatChartPrice(value), "N/A");
});

test("chart formatting never disguises a nonzero tiny token price as zero", () => {
  assert.equal(formatChartPrice(0.00000123), "0.00000123");
  assert.equal(formatChartPrice(0.00000042), "4.2e-7");
  assert.equal(formatChartPrice(-0.00000042, true), "-4.2e-7");
  assert.equal(formatChartPrice(1e-18, true), "1e-18");
  assert.notEqual(Number(formatChartPrice(Number.MIN_VALUE)), 0);
});

test("six-significant-digit axis labels distinguish neighboring tight-market ticks", () => {
  assert.equal(formatChartAxis(5066.01), "5.06601K");
  assert.equal(formatChartAxis(5066.02), "5.06602K");
  assert.equal(formatChartAxis(-5066.01), "-5.06601K");
  assert.equal(formatChartAxis(120_001_000), "120.001M");
  assert.equal(formatChartAxis(120_002_000), "120.002M");
  assert.equal(formatChartAxis(0.500001), "0.500001");
  assert.equal(formatChartAxis(0.500002), "0.500002");
  assert.equal(formatChartPrice(5066.01, true), "5.066K", "summary labels retain their shorter existing precision");
});

test("axis labels handle tiny prices, signed zero, and unavailable numeric values", () => {
  assert.equal(formatChartAxis(0.00000123456), "0.00000123456");
  assert.equal(formatChartAxis(1.23456e-7), "1.23456e-7");
  assert.equal(formatChartAxis(1.23457e-7), "1.23457e-7");
  assert.equal(formatChartAxis(-1.23456e-7), "-1.23456e-7");
  assert.equal(formatChartAxis(1e-18), "1e-18");
  assert.notEqual(Number(formatChartAxis(Number.MIN_VALUE)), 0);
  assert.equal(formatChartAxis(0), "0");
  assert.equal(formatChartAxis(-0), "0");
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(formatChartAxis(value), "N/A");
});

test("extreme valuations have bounded scientific labels rather than millions of trillions", () => {
  const value = 24975067622885110000;
  assert.equal(formatChartPrice(value, true), "2.498e+19");
  assert.equal(formatChartAxis(value), "2.49751e+19");
});

test("wallet marker buckets preserve equal real events while grouping direction and timestamp", () => {
  const first: WalletChartMarker = { t: 60, is_buy: true, quote: "100" };
  const repeated: WalletChartMarker = { t: 120, is_buy: true, quote: "200" };
  const sameTimeSale: WalletChartMarker = { t: 120, is_buy: false, quote: "200" };
  const sameTimeOtherAmount: WalletChartMarker = { t: 120, is_buy: true, quote: "300" };
  const snapshot = [sameTimeSale, repeated, first, repeated, sameTimeOtherAmount];
  const original = structuredClone(snapshot);
  assert.deepEqual(aggregateWalletMarkers(snapshot, 60), [{ t: 60, is_buy: true, count: 1 }, { t: 120, is_buy: true, count: 3 }, { t: 120, is_buy: false, count: 1 }]);
  assert.deepEqual(aggregateWalletMarkers(snapshot, 300), [{ t: 0, is_buy: true, count: 4 }, { t: 0, is_buy: false, count: 1 }]);
  assert.deepEqual(snapshot, original, "the original events are not reordered or changed");
  assert.deepEqual(aggregateWalletMarkers(snapshot, 60, 60, 60), [{ t: 60, is_buy: true, count: 1 }]);
  assert.deepEqual(aggregateWalletMarkers(snapshot, 60, 180), []);
});

test("wallet marker aggregation rejects invalid bucket sizes", () => {
  for (const interval of [0, -60, NaN, Infinity]) assert.throws(() => aggregateWalletMarkers([], interval), RangeError);
});

const samples: Candle[] = [
  { t: 0, open: 1, high: 5, low: 1, close: 3, volume: 12, trades: 2 },
  { t: 60, open: 3, high: 3, low: 3, close: 3, volume: 0, trades: 0, filled: true },
  { t: 120, open: 4, high: 7, low: 4, close: 6, volume: 20, trades: 3 },
  { t: 180, open: 6, high: 8, low: 2, close: 2, volume: 50, trades: 4 },
];

test("visible range stats use its carried first open, last close, and real highs/lows", () => {
  assert.deepEqual(selectedRangeStats(samples, 60, 120), { open: 3, close: 6, change: 1, high: 7, low: 4, volume: 20, trades: 3 });
  assert.deepEqual(selectedRangeStats([...samples].reverse(), 60, 120), selectedRangeStats(samples, 60, 120));
  assert.deepEqual(samples.map((candle) => candle.t), [0, 60, 120, 180], "does not mutate the caller's candles");
  assert.equal(selectedRangeStats(samples, 200, 300), null);
  assert.equal(selectedRangeStats(samples, 120, 60), null);
  assert.equal(selectedRangeStats([]), null);
});

test("baseline-only range does not invent trading extrema or volume", () => {
  assert.deepEqual(selectedRangeStats(samples, 60, 60), { open: 3, close: 3, change: 0, high: null, low: null, volume: 0, trades: 0 });
  assert.equal(selectedRangeStats([{ ...samples[0], open: 0 }])?.change, null);
});

test("price and market-cap scaling never multiplies the quote volume statistic", () => {
  const raw = selectedRangeStats(samples, 60, 120)!;
  const scaled = selectedRangeStats(scaleCandles(samples, 1_000_000), 60, 120)!;
  assert.equal(scaled.volume, raw.volume);
  assert.equal(scaled.change, raw.change);
  assert.equal(scaled.close, raw.close * 1_000_000);
});

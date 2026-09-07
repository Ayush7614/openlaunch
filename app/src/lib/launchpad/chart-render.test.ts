import assert from "node:assert/strict";
import test from "node:test";
import { CHART_SAFE_VALUE, prepareChartSeries } from "./chart-render.ts";
import type { Candle } from "./candles.ts";

const candle = (overrides: Partial<Candle> = {}): Candle => ({ t: 60, open: 2, high: 3, low: 1, close: 2.5, volume: 100, trades: 2, ...overrides });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual / expected - 1) < 1e-12, `${actual} != ${expected}`);

test("reported H launch market cap renders below the actual library data limit", () => {
  const price = 10_010_990.062344594;
  const raw = candle({ open: price, high: price, low: price, close: price, volume: 0, trades: 0, filled: true });
  const prepared = prepareChartSeries([raw], [1e9, 2494.765]);
  assert.equal(prepared.unavailable, false);
  near(prepared.display[0].open, 24975067622885110000);
  assert.ok(prepared.display[0].open > CHART_SAFE_VALUE);
  assert.ok(prepared.render[0].open < CHART_SAFE_VALUE);
  near(prepared.render[0].open * prepared.priceDivisor, prepared.display[0].open);
  assert.equal(prepared.render[0].filled, true);
  assert.equal(raw.open, price, "source is never mutated");
});

test("all OHLC extrema, not just the latest close, determine normalization", () => {
  const result = prepareChartSeries([candle({ high: 1e28 }), candle({ t: 120 })], [1]);
  assert.equal(result.unavailable, false);
  for (let i = 0; i < result.render.length; i++) for (const key of ["open", "high", "low", "close"] as const) {
    assert.ok(result.render[i][key] <= CHART_SAFE_VALUE);
    near(result.render[i][key] * result.priceDivisor, result.display[i][key]);
  }
});

test("histogram normalization is independent of price and supply conversion", () => {
  const result = prepareChartSeries([candle({ volume: 2e25 })], [1e9, 2500]);
  assert.equal(result.unavailable, false);
  assert.equal(result.display[0].volume, 2e25);
  assert.ok(result.render[0].volume < CHART_SAFE_VALUE);
  assert.notEqual(result.priceDivisor, result.volumeDivisor);
  near(result.render[0].volume * result.volumeDivisor, 2e25);
});

test("ordinary values remain unchanged while tiny values retain useful coordinates", () => {
  const ordinary = prepareChartSeries([candle()], [1]);
  assert.equal(ordinary.priceDivisor, 1);
  assert.equal(ordinary.volumeDivisor, 1);
  assert.deepEqual(ordinary.render, ordinary.display);
  const tiny = prepareChartSeries([candle({ open: 1e-30, high: 3e-30, low: 1e-30, close: 2e-30 })], [1]);
  assert.equal(tiny.unavailable, false);
  assert.ok(tiny.render[0].low > 0.1);
  near(tiny.render[0].low * tiny.priceDivisor, 1e-30);
});

test("invalid OHLC, volume, ordering or conversion produces a non-crashing unavailable state", () => {
  for (const invalid of [NaN, Infinity, -Infinity, 0, -1, null]) {
    assert.equal(prepareChartSeries([candle({ open: invalid as number })], [1]).unavailable, true);
    assert.equal(prepareChartSeries([candle()], [invalid as number]).unavailable, true);
  }
  assert.equal(prepareChartSeries([candle({ volume: Infinity })], [1]).unavailable, true);
  assert.equal(prepareChartSeries([candle({ high: 1 })], [1]).unavailable, true);
  assert.equal(prepareChartSeries([candle(), candle()], [1]).unavailable, true);
  assert.equal(prepareChartSeries([candle()], [1e308]).unavailable, true);
  assert.equal(prepareChartSeries([], [1]).unavailable, false);
});

test("constant normalization preserves relative percentage changes and candle ordering", () => {
  const result = prepareChartSeries([candle(), candle({ t: 120, open: 4, high: 6, low: 2, close: 5 })], [1e22]);
  near(result.render[1].close / result.render[0].close, 2);
  assert.deepEqual(result.render.map((bar) => bar.t), [60, 120]);
  assert.deepEqual(result.render.map((bar) => bar.trades), [2, 2]);
});

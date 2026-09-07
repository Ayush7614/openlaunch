import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketStart, defaultInterval, fillCandles, highLow, isInterval, mergeTail, scaleCandles } from "./candles.ts";

test("bucketStart floors to the interval", () => {
  assert.equal(bucketStart(1000, 300), 900);
  assert.equal(bucketStart(900, 300), 900);
  assert.equal(bucketStart(899, 300), 600);
});

test("fillCandles seeds from the launch price and carries the previous close through gaps", () => {
  const raw = [{ t: 600, open: 2, high: 3, low: 1, close: 2.5, volume: 10, trades: 2 }];
  const cs = fillCandles(raw, 300, 0, 1200, 1.5);
  assert.deepEqual(cs.map((c) => c.t), [0, 300, 600, 900, 1200]);
  assert.equal(cs[0].close, 1.5, "before any trade: launch price");
  assert.equal(cs[0].filled, true);
  assert.equal(cs[2].close, 2.5);
  assert.equal(cs[3].open, 2.5, "gap carries previous close");
  assert.equal(cs[3].volume, 0);
  assert.equal(cs[4].close, 2.5);
});

test("fillCandles snaps raw bucket timestamps to the interval", () => {
  const cs = fillCandles([{ t: 601, open: 1, high: 1, low: 1, close: 1, volume: 1, trades: 1 }], 300, 600, 600, 9);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].t, 600);
  assert.equal(cs[0].close, 1);
});

test("scaleCandles scales prices, not volume", () => {
  const [c] = scaleCandles([{ t: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 7, trades: 1 }], 10);
  assert.deepEqual([c.open, c.high, c.low, c.close, c.volume], [10, 20, 5, 15, 7]);
});

test("highLow ignores filled buckets; null when no trades", () => {
  const cs = fillCandles([{ t: 0, open: 2, high: 5, low: 1, close: 3, volume: 1, trades: 1 }], 60, 0, 120, 100);
  assert.deepEqual(highLow(cs), { high: 5, low: 1 });
  assert.equal(highLow(fillCandles([], 60, 0, 120, 100)), null);
});

test("mergeTail replaces overlapping buckets and appends", () => {
  const a = fillCandles([], 60, 0, 120, 1); // t = 0, 60, 120
  const tail = [{ t: 120, open: 2, high: 2, low: 2, close: 2, volume: 1, trades: 1 }, { t: 180, open: 2, high: 3, low: 2, close: 3, volume: 1, trades: 1 }];
  const m = mergeTail(a, tail);
  assert.deepEqual(m.map((c) => c.t), [0, 60, 120, 180]);
  assert.equal(m[2].close, 2);
  assert.equal(m[3].close, 3);
});

test("defaultInterval by age; isInterval guard", () => {
  assert.equal(defaultInterval(600), "1m");
  assert.equal(defaultInterval(5 * 3600), "5m");
  assert.equal(defaultInterval(3 * 86400), "1h");
  assert.equal(defaultInterval(30 * 86400), "4h");
  assert.equal(isInterval("5m"), true);
  assert.equal(isInterval("2m"), false);
});

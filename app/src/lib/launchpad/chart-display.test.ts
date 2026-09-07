import { test } from "node:test";
import assert from "node:assert/strict";
import { chartAlpha, chartValueUnit } from "./chart-display.ts";

test("chart volume colours are parser-compatible in both themes", () => {
  assert.equal(chartAlpha("#05df72", 0.25), "rgba(5, 223, 114, 0.25)");
  assert.equal(chartAlpha("#15803d", 0.25), "rgba(21, 128, 61, 0.25)");
  assert.equal(chartAlpha("#ff6b6b", 2), "rgba(255, 107, 107, 1)");
  assert.throws(() => chartAlpha("color-mix(in srgb, red 25%, transparent)", .25));
});
test("market cap labels do not invent USD conversions", () => {
  assert.equal(chartValueUnit("mcap", "AMC", false), "AMC");
  assert.equal(chartValueUnit("mcap", "ETH", true), "USD");
  assert.equal(chartValueUnit("quote", "ETH", true), "ETH");
});

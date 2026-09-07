import { test } from "node:test";
import assert from "node:assert/strict";
import { marketChange, marketUsd } from "./market-format.ts";

test("ledger money fits its column without rounding dust to zero", () => {
  assert.equal(marketUsd(0), "$0");
  assert.equal(marketUsd(0.0049), "<$0.01");
  assert.equal(marketUsd(0.1486467461), "$0.15");
  assert.equal(marketUsd(25_123), "$25.1K");
  assert.equal(marketUsd(Number.NaN), "N/A");
});

test("rounded zero changes are neutral; extreme values stay bounded", () => {
  assert.deepEqual(marketChange(0.00000003), { label: "0.0%", direction: "flat" });
  assert.deepEqual(marketChange(-0.00000003), { label: "0.0%", direction: "flat" });
  assert.deepEqual(marketChange(0.014), { label: "+1.4%", direction: "up" });
  assert.deepEqual(marketChange(-0.12), { label: "-12%", direction: "down" });
  assert.ok(marketChange(7.259e18).label.length < 12);
  assert.deepEqual(marketChange(Infinity), { label: "N/A", direction: "flat" });
});

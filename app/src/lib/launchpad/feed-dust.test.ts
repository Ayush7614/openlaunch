import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED_DUST_USD, dropDust, isDustSwap } from "./feed-dust.ts";

const swap = (over: Partial<{ usd: number | null; quote_wei: string; quote_decimals: number }> = {}) => ({ kind: "swap" as const, usd: null, quote_wei: "0", quote_decimals: 18, ...over });
const launch = { kind: "launch" as const };

test("priced swaps: dust is anything under FEED_DUST_USD", () => {
  assert.equal(FEED_DUST_USD, 0.01);
  assert.equal(isDustSwap(swap({ usd: 0.0099, quote_wei: "4000000000000000", quote_decimals: 18 })), true, "a $0.0099 buy is dust however many wei it is");
  assert.equal(isDustSwap(swap({ usd: 0.01, quote_wei: "1", quote_decimals: 18 })), false, "exactly one cent stays");
  assert.equal(isDustSwap(swap({ usd: 15.65, quote_wei: "6525170685363478", quote_decimals: 18 })), false);
  assert.equal(isDustSwap(swap({ usd: 0, quote_wei: "0", quote_decimals: 6 })), true, "nothing moved: dust");
});

test("a price that reads 0 is treated as no price: a real trade in that quote stays in the feed", () => {
  // e.g. a GITLAWB price read of 0 during a pool hiccup: $0 × 2.79M GITLAWB must not drop the trade
  assert.equal(isDustSwap(swap({ usd: 0, quote_wei: "125573071944892711331197", quote_decimals: 18 })), false);
  assert.equal(isDustSwap(swap({ usd: -1, quote_wei: "18924421", quote_decimals: 6 })), false, "a negative price is nonsense, not a verdict");
  assert.equal(isDustSwap(swap({ usd: 0, quote_wei: "4999", quote_decimals: 6 })), true, "the display floor still applies without a price");
});

test("unpriced swaps fall back to the display floor: whatever would print as 0 is dust", () => {
  // USDG (6 dec): 4,999 raw = 0.004999 → "0" before the floor → dust; 5,000 raw → "0.01" → stays
  assert.equal(isDustSwap(swap({ usd: null, quote_wei: "4999", quote_decimals: 6 })), true);
  assert.equal(isDustSwap(swap({ usd: null, quote_wei: "5000", quote_decimals: 6 })), false);
  // 18-dec quotes (ETH, GITLAWB, Robinhood stocks): under 5 gwei is dust
  assert.equal(isDustSwap(swap({ usd: null, quote_wei: "4999999999", quote_decimals: 18 })), true);
  assert.equal(isDustSwap(swap({ usd: null, quote_wei: "5000000000", quote_decimals: 18 })), false);
  assert.equal(isDustSwap(swap({ usd: null, quote_wei: "1703", quote_decimals: 8 })), false, "0.00001703 MSTRc prints, so it stays");
  assert.equal(isDustSwap(swap({ usd: NaN, quote_wei: "1", quote_decimals: 18 })), true, "a broken price counts as no price");
});

test("dropDust keeps order, keeps launches, and trims to the limit after filtering", () => {
  const dust = swap({ usd: 0.001 });
  const real = swap({ usd: 25 });
  const items = [dust, real, launch, dust, dust, real, real, launch, real];
  assert.deepEqual(dropDust(items, 24), [real, launch, real, real, launch, real]);
  assert.deepEqual(dropDust(items, 3), [real, launch, real], "the limit applies to what survives");
  assert.deepEqual(dropDust([dust, dust, dust], 5), [], "all dust → empty, never a 0 row");
  assert.deepEqual(dropDust([], 5), []);
});

test("a dust burst does not empty the feed when the caller over-fetches", () => {
  // getLaunchFeed asks for 2n swaps and n launches, then trims to n: 30 dust swaps ahead of 24 real ones still yield 24 rows
  const items = [...Array.from({ length: 30 }, () => swap({ usd: 0.0001 })), ...Array.from({ length: 24 }, () => swap({ usd: 3 }))];
  assert.equal(dropDust(items, 24).length, 24);
});

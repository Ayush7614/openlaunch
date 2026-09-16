import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED_DUST_USD, FEED_SWAP_PAGES, collectNonDust, isDustSwap } from "./feed-dust.ts";

const swap = (over: Partial<{ usd: number | null; quote_wei: string; quote_decimals: number }> = {}) => ({ kind: "swap" as const, usd: null, quote_wei: "0", quote_decimals: 18, ...over });

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

type Row = { id: number; usd: number | null; quote_wei: string; quote_decimals: number };
const row = (id: number, usd: number): Row => ({ id, usd, quote_wei: "1", quote_decimals: 18 });
/** A newest-first table of rows; `pager` serves offset pages from it and counts the reads. */
function source(rows: Row[]) {
  const reads: [number, number][] = [];
  const fetchPage = async (offset: number, size: number) => {
    reads.push([offset, size]);
    return rows.slice(offset, offset + size);
  };
  return { fetchPage, reads };
}
const ids = (rows: Row[]) => rows.map((r) => r.id);
const keyOf = (r: Row) => String(r.id);

test("collectNonDust fills from the newest page and reads nothing more when it can", () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(i, 5));
  const s = source(rows);
  return collectNonDust(s.fetchPage, 24, keyOf).then((out) => {
    assert.deepEqual(ids(out), ids(rows.slice(0, 24)), "newest first, in source order");
    assert.deepEqual(s.reads, [[0, 48]], "one page of 2×limit");
  });
});

test("regression: 30 dust swaps ahead of 24 real ones still yield 24 rows — the older real swaps are paged in", () => {
  const rows = [...Array.from({ length: 30 }, (_, i) => row(i, 0.0001)), ...Array.from({ length: 24 }, (_, i) => row(100 + i, 3))];
  const s = source(rows);
  return collectNonDust(s.fetchPage, 24, keyOf).then((out) => {
    assert.equal(out.length, 24);
    assert.deepEqual(ids(out), ids(rows.slice(30)), "every real swap, none of the dust, oldest real one included");
    assert.deepEqual(s.reads, [[0, 48], [48, 48]], "a second page was needed and read once");
  });
});

test("collectNonDust stops at a short page: the source ran dry", () => {
  const rows = [row(1, 0.001), row(2, 9), row(3, 0.001)];
  const s = source(rows);
  return collectNonDust(s.fetchPage, 24, keyOf).then((out) => {
    assert.deepEqual(ids(out), [2]);
    assert.deepEqual(s.reads, [[0, 48]], "a page smaller than requested is the end");
  });
});

test("collectNonDust is a bounded read under a dust flood: FEED_SWAP_PAGES pages, then it gives up", () => {
  const rows = Array.from({ length: 10_000 }, (_, i) => row(i, 0.0001));
  const s = source(rows);
  return collectNonDust(s.fetchPage, 24, keyOf).then((out) => {
    assert.deepEqual(out, []);
    assert.equal(s.reads.length, FEED_SWAP_PAGES);
    assert.equal(FEED_SWAP_PAGES, 4);
    assert.deepEqual(s.reads.at(-1), [3 * 48, 48]);
  });
});

test("collectNonDust drops a row that shifted across a page boundary between reads", () => {
  const dust = Array.from({ length: 47 }, (_, i) => row(i, 0.0001));
  const real = row(500, 7);
  let reads = 0;
  // the first page ends with `real`; a swap lands at the top of the table before the second read, so `real` is served again
  const fetchPage = async (offset: number, size: number) => (reads++ === 0 ? [...dust, real].slice(offset, offset + size) : [real, row(600, 8)]);
  return collectNonDust(fetchPage, 24, keyOf).then((out) => assert.deepEqual(ids(out), [500, 600]));
});

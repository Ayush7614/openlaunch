import { test } from "node:test";
import assert from "node:assert/strict";
import { clampLimit, clampOffset, newestFirst, splitPage } from "./paging.ts";

test("clampLimit / clampOffset", () => {
  assert.equal(clampLimit("abc"), 40);
  assert.equal(clampLimit(0), 40);
  assert.equal(clampLimit(999), 200);
  assert.equal(clampLimit("25"), 25);
  assert.equal(clampOffset(-5), 0);
  assert.equal(clampOffset("80"), 80);
});

test("splitPage reports hasMore from the extra row", () => {
  assert.deepEqual(splitPage([1, 2, 3], 2), { items: [1, 2], hasMore: true });
  assert.deepEqual(splitPage([1, 2], 2), { items: [1, 2], hasMore: false });
});

test("newestFirst orders by time across chains, not by block number", () => {
  const base = { block_time: "2026-09-06T20:00:00Z", chain_id: 8453, block_number: 50_950_000 };
  const rh = { block_time: "2026-09-06T19:00:00Z", chain_id: 4663, block_number: 55_900_000 };
  assert.equal([rh, base].sort(newestFirst)[0], base, "the newer Base launch wins despite the lower block number");
});

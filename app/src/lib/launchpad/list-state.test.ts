import { test } from "node:test";
import assert from "node:assert/strict";
import { launchKey, mergeLaunches, refreshInPlace } from "./list-state.ts";

test("launch identity includes chain and normalizes address case", () => {
  assert.equal(launchKey({ chain: "base", token: "0xAbC" }), "base:0xabc");
  assert.notEqual(launchKey({ chain: "base", token: "0xabc" }), launchKey({ chain: "robinhood", token: "0xabc" }));
});

test("pagination deduplicates only within a chain and refreshes existing values", () => {
  const a = { chain: "base", token: "0xabc", count: 1 };
  const b = { chain: "robinhood", token: "0xabc", count: 2 };
  assert.deepEqual(mergeLaunches([a], [{ ...a, count: 3 }, b, b]), [{ ...a, count: 3 }, b]);
});

test("interaction holds order and targets while refreshing market data", () => {
  const a = { chain: "base", token: "0xabc", count: 1 };
  const b = { chain: "robinhood", token: "0xabc", count: 2 };
  const c = { chain: "base", token: "0xdef", count: 5 };
  assert.deepEqual(refreshInPlace([a, b], [c, { ...b, count: 4 }, { ...a, count: 3 }]), [{ ...a, count: 3 }, { ...b, count: 4 }]);
  assert.deepEqual(refreshInPlace([a, b], []), [a, b]);
});

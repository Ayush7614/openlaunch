import { test } from "node:test";
import assert from "node:assert/strict";
import { eligible1h, orderWithKing, rankTrending, stickyKing, trendingScore } from "./trending.ts";

const now = Date.parse("2026-09-07T03:00:00Z");
const row = (o: Partial<Parameters<typeof trendingScore>[0]> & { token: string }) => ({
  chain: "base",
  trades_1h: 0,
  traders_1h: 0,
  volume_1h_usd: 0,
  trades_24h: 0,
  volume_24h_usd: 0,
  holders: 0,
  block_time: "2026-09-06T00:00:00Z",
  ...o,
});

test("eligibility: needs 3 trades from 2 wallets in the hour", () => {
  assert.equal(eligible1h(row({ token: "a", trades_1h: 3, traders_1h: 2 })), true);
  assert.equal(eligible1h(row({ token: "b", trades_1h: 40, traders_1h: 1 })), false, "one bot ping-ponging");
  assert.equal(eligible1h(row({ token: "c", trades_1h: 2, traders_1h: 2 })), false);
});

test("score: trades dominate, volume is log-scaled, freshness boosts young tokens only", () => {
  const busy = row({ token: "busy", trades_1h: 30, traders_1h: 9, volume_1h_usd: 500, holders: 20 });
  const whale = row({ token: "whale", trades_1h: 3, traders_1h: 2, volume_1h_usd: 50_000, holders: 3 });
  assert.ok(trendingScore(busy, now) > trendingScore(whale, now), "30 small trades beat one $50K buy");
  const young = row({ token: "young", trades_1h: 10, traders_1h: 5, volume_1h_usd: 100, holders: 5, block_time: "2026-09-07T02:30:00Z" });
  const old = row({ token: "old", trades_1h: 10, traders_1h: 5, volume_1h_usd: 100, holders: 5 });
  assert.ok(trendingScore(young, now) > trendingScore(old, now), "30 minutes old gets the freshness bonus");
  assert.ok(trendingScore(young, now) < trendingScore(old, now) * 1.5 + 1e-9, "bonus capped at 1.5×");
});

test("rankTrending: hour window when ≥3 qualify, capped at the strip size, sorted by score", () => {
  const rows = Array.from({ length: 10 }, (_, i) => row({ token: `t${i}`, trades_1h: 3 + i, traders_1h: 2 + i, volume_1h_usd: 10 * i, holders: i }));
  const r = rankTrending(rows, now);
  assert.equal(r.window, "1h");
  assert.equal(r.items.length, 5);
  assert.equal(r.items[0].token, "t9");
  assert.equal(r.items[4].token, "t5");
});

test("rankTrending: falls back to the 24h window, or empty when nothing traded today", () => {
  const rows = [row({ token: "a", trades_1h: 5, traders_1h: 3, trades_24h: 40, volume_24h_usd: 900 }), row({ token: "b", trades_24h: 12, volume_24h_usd: 50 }), row({ token: "c", trades_24h: 2 })];
  const r = rankTrending(rows, now);
  assert.equal(r.window, "24h", "only one token qualifies for the hour");
  assert.deepEqual(r.items.map((i) => i.token), ["a", "b"], "c has too few day trades");
  assert.deepEqual(rankTrending([row({ token: "z" })], now), { window: "24h", items: [] });
});

test("stickyKing: incumbent holds until a challenger leads two polls in a row", () => {
  let s = stickyKing(null, "a", { token: null, n: 0 });
  assert.equal(s.king, "a");
  s = stickyKing("a", "b", s.streak);
  assert.equal(s.king, "a", "first poll: b leads but a keeps the card");
  assert.deepEqual(s.streak, { token: "b", n: 1 });
  s = stickyKing("a", "c", s.streak);
  assert.equal(s.king, "a", "a different challenger resets the streak");
  assert.deepEqual(s.streak, { token: "c", n: 1 });
  s = stickyKing("a", "c", s.streak);
  assert.equal(s.king, "c", "second consecutive poll → c takes over");
  assert.equal(stickyKing("c", null, s.streak).king, null, "nothing trending → no king");
});

test("orderWithKing puts the king first and keeps the rest in score order", () => {
  const items = [{ token: "x" }, { token: "y" }, { token: "z" }];
  assert.deepEqual(orderWithKing(items, "y").map((i) => i.token), ["y", "x", "z"]);
  assert.deepEqual(orderWithKing(items, "nope").map((i) => i.token), ["x", "y", "z"]);
  assert.deepEqual(orderWithKing(items, null).map((i) => i.token), ["x", "y", "z"]);
});

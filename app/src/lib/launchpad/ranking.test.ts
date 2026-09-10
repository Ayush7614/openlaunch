import { test } from "node:test";
import assert from "node:assert/strict";
import { GRACE_HOURS, eligible1h, eligible24h, liveChip, liveTier, orderWithKing, rankTrending, stickyKing, trendingScore } from "./ranking.ts";

const now = Date.parse("2026-09-07T03:00:00Z");
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
const row = (o: Partial<Parameters<typeof trendingScore>[0]> & { token: string }) => ({
  chain: "base",
  trades_1h: 0,
  traders_1h_ex: 0,
  volume_1h_usd: 0,
  trades_24h: 0,
  traders_24h_ex: 0,
  volume_24h_usd: 0,
  holders: 0,
  block_time: "2026-09-06T00:00:00Z",
  last_trade_at: null,
  ...o,
});

test("liveTier: an outside wallet in the day makes it live, else new inside the grace hour, else quiet", () => {
  assert.equal(GRACE_HOURS, 1);
  assert.equal(liveTier(row({ token: "a", block_time: at(59) }), now), "new", "59 minutes old, nobody yet");
  assert.equal(liveTier(row({ token: "b", block_time: at(61) }), now), "quiet", "61 minutes old, nobody yet");
  assert.equal(liveTier(row({ token: "c", block_time: at(61), traders_24h_ex: 1, last_trade_at: at(5) }), now), "live", "one outside wallet is enough");
  assert.equal(liveTier(row({ token: "d", block_time: at(5), traders_24h_ex: 1, last_trade_at: at(1) }), now), "live", "a buyer in the first minutes: live, not new");
  assert.equal(liveTier(row({ token: "e", block_time: at(30 * 60), traders_24h_ex: 3, last_trade_at: at(23 * 60) }), now), "live", "a day old, outside trade 23h ago");
  assert.equal(liveTier(row({ token: "f", block_time: at(30 * 60), trades_24h: 12, holders: 6 }), now), "quiet", "trades and holders without an outside wallet in the window never count (self-trades, or the last outside trade is >24h old)");
});

test("liveChip: says why the row sits where it sits", () => {
  assert.deepEqual(liveChip(row({ token: "a", traders_1h_ex: 3, traders_24h_ex: 7, last_trade_at: at(12) }), now), { tier: "live", text: "3 wallets this hour · 12m ago" });
  assert.deepEqual(liveChip(row({ token: "b", traders_24h_ex: 1, last_trade_at: at(5 * 60) }), now), { tier: "live", text: "1 wallet today · 5h ago" });
  assert.deepEqual(liveChip(row({ token: "c", block_time: at(4) }), now), { tier: "new", text: "just launched · 4m" });
  assert.deepEqual(liveChip(row({ token: "d", block_time: at(4), launcher_collapsed: 2 }), now), { tier: "new", text: "just launched · 4m · +2 from this wallet" });
  assert.deepEqual(liveChip(row({ token: "e", block_time: at(600) }), now), { tier: "quiet", text: "no buyers yet" });
  assert.deepEqual(liveChip(row({ token: "f", block_time: at(600), launcher_collapsed: 4 }), now), { tier: "quiet", text: "no buyers yet · +4 from this wallet" });
});

test("eligibility: 3 trades from 2 outside wallets in the hour; the day window needs at least one outside wallet", () => {
  assert.equal(eligible1h(row({ token: "a", trades_1h: 3, traders_1h_ex: 2 })), true);
  assert.equal(eligible1h(row({ token: "b", trades_1h: 40, traders_1h_ex: 1 })), false, "one bot ping-ponging");
  assert.equal(eligible1h(row({ token: "c", trades_1h: 2, traders_1h_ex: 2 })), false);
  assert.equal(eligible24h(row({ token: "d", trades_24h: 30, traders_24h_ex: 0 })), false, "a creator trading alone all day");
  assert.equal(eligible24h(row({ token: "e", trades_24h: 3, traders_24h_ex: 1 })), true);
});

test("score: outside wallets dominate, trades and volume are log-scaled, freshness boosts young tokens only", () => {
  const busy = row({ token: "busy", trades_1h: 30, traders_1h_ex: 9, volume_1h_usd: 500, holders: 20 });
  const whale = row({ token: "whale", trades_1h: 3, traders_1h_ex: 2, volume_1h_usd: 50_000, holders: 3 });
  assert.ok(trendingScore(busy, now) > trendingScore(whale, now), "30 small trades from 9 wallets beat one $50K buy");
  const loop = row({ token: "loop", trades_1h: 30, traders_1h_ex: 1, volume_1h_usd: 500 });
  const three = row({ token: "three", trades_1h: 3, traders_1h_ex: 3, volume_1h_usd: 50 });
  assert.ok(trendingScore(three, now) > trendingScore(loop, now), "three wallets beat one wallet looping thirty trades");
  const young = row({ token: "young", trades_1h: 10, traders_1h_ex: 5, volume_1h_usd: 100, holders: 5, block_time: "2026-09-07T02:30:00Z" });
  const old = row({ token: "old", trades_1h: 10, traders_1h_ex: 5, volume_1h_usd: 100, holders: 5 });
  assert.ok(trendingScore(young, now) > trendingScore(old, now), "30 minutes old gets the freshness bonus");
  assert.ok(trendingScore(young, now) < trendingScore(old, now) * 1.5 + 1e-9, "bonus capped at 1.5×");
});

test("rankTrending: hour window when ≥3 qualify, capped at the strip size, sorted by score", () => {
  const rows = Array.from({ length: 10 }, (_, i) => row({ token: `t${i}`, trades_1h: 3 + i, traders_1h_ex: 2 + i, volume_1h_usd: 10 * i, holders: i }));
  const r = rankTrending(rows, now);
  assert.equal(r.window, "1h");
  assert.equal(r.items.length, 5);
  assert.equal(r.items[0].token, "t9");
  assert.equal(r.items[4].token, "t5");
});

test("rankTrending: falls back to the 24h window, or empty when nothing traded today", () => {
  const rows = [row({ token: "a", trades_1h: 5, traders_1h_ex: 3, trades_24h: 40, traders_24h_ex: 6, volume_24h_usd: 900 }), row({ token: "b", trades_24h: 12, traders_24h_ex: 2, volume_24h_usd: 50 }), row({ token: "c", trades_24h: 2, traders_24h_ex: 1 }), row({ token: "d", trades_24h: 20, traders_24h_ex: 0 })];
  const r = rankTrending(rows, now);
  assert.equal(r.window, "24h", "only one token qualifies for the hour");
  assert.deepEqual(r.items.map((i) => i.token), ["a", "b"], "c has too few day trades, d has no outside wallet");
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

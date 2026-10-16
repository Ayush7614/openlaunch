import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CHAIN_KEYS } from "../chainKeys.ts";
import { MCAP_PRESETS, launchpad, listedQuoteAddresses, quoteInfo } from "./config.ts";
import { cleanQuoteSymbol } from "./unlisted-quote.ts";
import { quotePillOf } from "./ogcard.ts";
import {
  PAIR_COPY,
  PAIR_DELIST_AFTER_MS,
  PAIR_SUSPEND_AFTER_MS,
  buildPairAdminMessage,
  guardedPairPrice,
  isPairWebsite,
  isSiteLogoPath,
  isXHandle,
  nextPairStatus,
  pairBuyPresets,
  pairPriceFromRaw,
  pairPriceFromSqrt,
  pairPriceFromTick,
  pairSymbolProblem,
  pairTitle,
  pairVolumeLabel,
  sortsBelow,
  timeWeightedPrice,
  twapSpan,
  type PairState,
} from "./pairs.ts";

/**
 * Community pairs (pairs.ts): an app-level list with public checks. MUSEWORLD, an official quote in code until now, is
 * the first pair (seeded by db/schema.sql) and has no special status left anywhere in the code.
 */
const src = (rel: string) => readFileSync(path.join(import.meta.dirname, rel), "utf8");
const MUSEWORLD = "0x882c8e35504d58979b1280fe76d6553f717029f8";
const GITLAWB = "0x5f980dcfc4c0fa3911554cf5ab288ed0eb13dba3";

/* ── names ── */

test("a pair's symbol: short, plain, never a core quote's, never another pair's", () => {
  assert.equal(pairSymbolProblem("NOICE", []), null);
  assert.equal(pairSymbolProblem("1F916", []), null);
  for (const bad of ["", "WAY_TOO_LONG_SYMBOL", "NO SPACE", "$NOICE", "ÑOICE"]) assert.ok(pairSymbolProblem(bad, []), bad);
  for (const core of ["ETH", "weth", "USDC", "USDT", "usd1", "GITLAWB", "gitlawb2", "TWIG", "twigx", "cbBTC"]) assert.ok(pairSymbolProblem(core, []), core);
  assert.ok(pairSymbolProblem("noice", ["NOICE"]), "taken, whatever the case");
});

test("listing fields: our own logos only, https sites, real X handles", () => {
  assert.equal(isSiteLogoPath("/museworld-mark.png"), true);
  for (const bad of ["https://evil.example/x.png", "/../etc/passwd", "/a/b.png", "museworld-mark.png", "/x.svg", "//evil.example/x.png"]) assert.equal(isSiteLogoPath(bad), false, bad);
  assert.equal(isPairWebsite("https://noice.so"), true);
  for (const bad of ["http://noice.so", "javascript:alert(1)", "https://user:pw@noice.so", "https://localhost", `https://${"a".repeat(200)}.so`]) assert.equal(isPairWebsite(bad), false, bad);
  assert.equal(isXHandle("noicedotso"), true);
  assert.equal(isXHandle("@noicedotso"), false, "the server strips the @ first");
  assert.equal(isXHandle("way_too_long_handle_x"), false);
});

/* ── prices ── */

test("pool prices: either token order, any decimals", () => {
  assert.equal(sortsBelow("0x0000000000000000000000000000000000000000", MUSEWORLD), true, "native ETH is always currency0");
  assert.equal(sortsBelow("0x4200000000000000000000000000000000000006", "0x9cb41fd9dc6891bae8187029461bfaadf6cc0c69"), true);
  // pair is token0: raw token1-per-token0 is quote raw per pair raw
  assert.equal(pairPriceFromRaw(2, true, 18, 18), 2);
  // pair is token1: invert
  assert.equal(pairPriceFromRaw(4, false, 18, 18), 0.25);
  // USDC (6) as the quote of an 18-dec pair, pair token0: 1e-12 raw USDC per raw pair = $1 per whole pair
  assert.ok(Math.abs(pairPriceFromRaw(1e-12, true, 18, 6)! - 1) < 1e-9);
  assert.equal(pairPriceFromRaw(0, true, 18, 18), null);
  assert.equal(pairPriceFromRaw(Number.NaN, true, 18, 18), null);
  assert.ok(Math.abs(pairPriceFromSqrt(2n ** 96n, true, 18, 18)! - 1) < 1e-12, "sqrtPriceX96 = 2^96 is a price of 1");
  assert.ok(Math.abs(pairPriceFromTick(0, false, 18, 18)! - 1) < 1e-12);
  assert.ok(Math.abs(pairPriceFromTick(6932, true, 18, 18)! - 2) < 0.001, "1.0001^6932 ≈ 2");
});

test("time-weighted price: a one-block push barely moves a 30-minute average", () => {
  const from = 0;
  const to = 1800;
  assert.equal(timeWeightedPrice([], 2, from, to), 2, "no swaps: the price before the window held throughout");
  assert.equal(timeWeightedPrice([], null, from, to), null, "nothing known");
  const pushed = timeWeightedPrice([{ t: 1798, price: 10 }], 1, from, to)!;
  assert.ok(pushed < 1.02, `pushed average ${pushed}`);
  assert.equal(timeWeightedPrice([{ t: 900, price: 3 }], 1, from, to), 2);
  assert.equal(timeWeightedPrice([{ t: 900, price: 3 }, { t: 1500, price: 1 }], null, from, to), (3 * 600 + 1 * 300) / 900);
  assert.equal(timeWeightedPrice([{ t: 1500, price: 1 }, { t: 900, price: 3 }, { t: 1000, price: Number.NaN }, { t: 1100, price: 0 }], null, from, to), (3 * 600 + 1 * 300) / 900);
  assert.equal(timeWeightedPrice([{ t: 10, price: 5 }], 1, 100, 100), null, "empty window");
  assert.deepEqual(twapSpan([{ t: 1200, price: 2 }], null, from, to), { price: 2, span: 600 }, "samples from minute 20 only cover 10 minutes");
});

test("the guard: an average is required, and a spot more than 25% off it is replaced by it", () => {
  assert.deepEqual(guardedPairPrice(1, null), { price: null, source: null, deviation: null }, "no average, no price (stricter than GITLAWB's own rule)");
  assert.equal(guardedPairPrice(1.2, 1).source, "spot");
  assert.deepEqual(guardedPairPrice(2, 1), { price: 1, source: "twap", deviation: 1 });
  assert.equal(guardedPairPrice(null, 1).price, 1);
});

test("pair page labels: no doubled title, no ten-decimal cents", () => {
  assert.equal(pairTitle({ name: "noice", symbol: "noice" }), "noice");
  assert.equal(pairTitle({ name: "Museworld", symbol: "MUSEWORLD" }), "Museworld");
  assert.equal(pairTitle({ name: "Claw Bank", symbol: "CLAW" }), "Claw Bank (CLAW)");
  assert.deepEqual([null, 0, 0.3276, 12.4, 8_100, 9_320, 12_400, 1_450_000].map(pairVolumeLabel), ["–", "$0", "under $1", "$12", "$8.1K", "$9.3K", "$12.4K", "$1.4M"]);
});

test("buy presets: about $5, $25, $100 and $500 of the pair at its price, none without one", () => {
  assert.deepEqual(pairBuyPresets(0.000008, 18), ["625000", "3125000", "12500000", "62500000"]);
  assert.deepEqual(pairBuyPresets(null, 18), []);
  assert.deepEqual(pairBuyPresets(0, 18), []);
});

/* ── status ── */

const T0 = Date.UTC(2026, 9, 16);
const listed: PairState = { status: "listed", status_by: "admin", status_at: T0, failing_since: null };
const soft = { ok: false as const, hard: false, reason: "No USD price" };
const hard = { ok: false as const, hard: true, reason: "Its contract code changed." };

test("monitor: an unknown reading changes nothing; a soft failure suspends after 24 hours, a hard one at once", () => {
  assert.equal(nextPairStatus(listed, null, T0 + 1).changed, false);
  const first = nextPairStatus(listed, soft, T0 + 1000);
  assert.equal(first.status, "listed");
  assert.equal(first.failing_since, T0 + 1000, "the clock starts");
  const later = nextPairStatus({ ...listed, failing_since: T0 }, soft, T0 + PAIR_SUSPEND_AFTER_MS - 1);
  assert.equal(later.status, "listed");
  const day = nextPairStatus({ ...listed, failing_since: T0 }, soft, T0 + PAIR_SUSPEND_AFTER_MS);
  assert.deepEqual([day.status, day.status_by, day.changed], ["suspended", "monitor", true]);
  assert.match(day.reason!, /for 24 hours/);
  const now = nextPairStatus(listed, hard, T0 + 5);
  assert.deepEqual([now.status, now.reason], ["suspended", hard.reason]);
  assert.equal(nextPairStatus({ ...listed, failing_since: T0 }, { ok: true }, T0 + 5).failing_since, null, "a pass resets the clock");
});

test("monitor: its own suspensions heal or end in a delisting; an admin's and delistings are left alone", () => {
  const sus: PairState = { status: "suspended", status_by: "monitor", status_at: T0, failing_since: T0 - PAIR_SUSPEND_AFTER_MS };
  const back = nextPairStatus(sus, { ok: true }, T0 + 1);
  assert.deepEqual([back.status, back.failing_since, back.changed], ["listed", null, true]);
  assert.equal(nextPairStatus(sus, soft, T0 + PAIR_DELIST_AFTER_MS - 1).status, "suspended");
  const gone = nextPairStatus(sus, soft, T0 + PAIR_DELIST_AFTER_MS);
  assert.deepEqual([gone.status, gone.changed], ["delisted", true]);
  const byAdmin: PairState = { ...sus, status_by: "admin" };
  assert.equal(nextPairStatus(byAdmin, { ok: true }, T0 + 1).changed, false, "only an admin lifts an admin's suspension");
  assert.equal(nextPairStatus({ ...sus, status: "delisted" }, { ok: true }, T0 + 1).changed, false);
});

/* ── admin ── */

test("admin message: its own wording, and every listing field the server stores is in it", () => {
  const m = buildPairAdminMessage({
    action: "list",
    chain: "base",
    address: "0x9CB41FD9DC6891BAE8187029461BFAADF6CC0C69",
    wallet: "0xABCDEF0000000000000000000000000000000001",
    nonce: "0123456789abcdef0123456789abcdef",
    ts: Date.UTC(2026, 9, 16, 12),
    listing: { logo: "", website: "https://noice.so", x_handle: "noicedotso", description: "Noice.", in_form: true, price_kind: "univ3", price_pool: "0xPOOL", price_quote: "0x4200000000000000000000000000000000000006", price_hook: "" },
  });
  assert.equal(
    m,
    [
      "openlaunch.lol community pairs",
      "",
      "Action: list",
      "Pair: base:0x9cb41fd9dc6891bae8187029461bfaadf6cc0c69",
      "Price: univ3 0xpool against 0x4200000000000000000000000000000000000006",
      "In the launch form: yes",
      "Logo: -",
      "Website: https://noice.so",
      "X: noicedotso",
      "About: Noice.",
      "Admin: 0xabcdef0000000000000000000000000000000001",
      "Nonce: 0123456789abcdef0123456789abcdef",
      "Issued: 2026-10-16T12:00:00.000Z",
    ].join("\n"),
  );
  assert.match(buildPairAdminMessage({ action: "suspend", chain: "base", address: MUSEWORLD, wallet: MUSEWORLD, nonce: "0".repeat(32), ts: 0, reason: "x" }), /\nReason: x\n/);
});

test("server: the signature is checked before anything is written, by an admin, once", () => {
  const s = src("pairsServer.ts");
  const order = ["if (!adminWallets().has(wallet))", "await verify(chain, wallet, message, b.signature)", "await consumeNonce(b.nonce, wallet)", "INSERT INTO bb_pairs"];
  const at = order.map((o) => s.indexOf(o));
  assert.ok(at.every((i) => i > 0), JSON.stringify(at));
  assert.deepEqual([...at].sort((a, b) => a - b), at, "admin → verify → nonce → write");
  assert.match(s, /FOR UPDATE SKIP LOCKED/, "one machine claims each pair's hourly check");
  assert.match(src("loop.ts"), /void pairsTick\(\)/);
});

/* ── wiring ── */

test("resolution: only a LISTED pair gets the pair key, a price and a badge; anything else is an unlisted pair", () => {
  const q = src("queries.ts");
  assert.match(q, /if \(pair\?\.status === "listed"\) return \{ key: "pair",/);
  assert.match(q, /\.\.\.listedPairSymbols\(st, chain\)\]/, "an unlisted token may not borrow a listed pair's symbol");
  assert.match(q, /const pairCase = pairArms\.length/, "USD sorts price listed pairs");
  assert.match(q, /\$\{pairDecCase\} ELSE 18 END/, "and read their decimals");
  assert.match(q, /rankTrending\(rows\.filter\(\(r\) => r\.quote_key !== "other"\)/, "a suspended pair resolves as other, so it leaves Trending");
  assert.match(q, /if \(q\.key === "pair" && q\.pairKind !== "launch"\) return \{ key: q\.key, decimals: q\.decimals, usd: null, priced: false \};/, "points: only pairs priced from an openlaunch pool");
});

test("MUSEWORLD: the first pair, seeded by the schema, with no special case left in code", () => {
  const schema = src("../../../db/schema.sql");
  assert.match(schema, new RegExp(`VALUES \\(8453, '${MUSEWORLD}', 'MUSEWORLD', 'Museworld', 18, '/museworld-mark\\.png'[\\s\\S]*?'listed', true, 'launch',\\s*'${MUSEWORLD}', '${GITLAWB}'\\)\\s*ON CONFLICT \\(chain_id, address\\) DO NOTHING;`));
  assert.ok(existsSync(path.join(import.meta.dirname, "../../../public/museworld-mark.png")), "its seeded logo is served from public/");
  assert.equal(quoteInfo("base", MUSEWORLD).key, "other", "the static config no longer knows it: the server's pair list does");
  assert.ok(!listedQuoteAddresses("base").includes(MUSEWORLD));
  for (const k of CHAIN_KEYS) assert.ok(!launchpad(k).quotes.some((q) => q.key === "pair"), "pairs reach the form from the list, never the static config");
  assert.deepEqual(MCAP_PRESETS.pair, []);
  for (const fake of ["MUSEWORLD", "$MUSEWORLD", "MUSEWORLD2"]) assert.equal(cleanQuoteSymbol(fake), null, `${fake}: a copy shows by address`);
  assert.equal(existsSync(path.join(import.meta.dirname, "museworld.ts")), false);
});

test("words: no seal, no 'official', no value talk, in the badge, the copy, the token page and the share card", () => {
  const banned = /\b(official|verified|safe|guarantee[ds]?|moon|rally|endorsed)\b/i;
  for (const [k, v] of Object.entries(PAIR_COPY)) {
    const text = typeof v === "function" ? (v as (a: string, b: string | null) => string)("NOICE", "a reason") : v;
    assert.doesNotMatch(text, banned, k);
  }
  const badge = src("../../components/launchpad/QuoteBadge.tsx");
  assert.doesNotMatch(badge, /BadgeCheck|official/i);
  assert.doesNotMatch(src("../../app/t/[chain]/[token]/opengraph-image.tsx"), /official/);
  assert.match(src("../../app/t/[chain]/[token]/opengraph-image.tsx"), /community pair · priced in \$\{card\.quote\.symbol\}/);
  assert.doesNotMatch(src("../../app/t/[chain]/[token]/page.tsx"), /official token/);
  assert.deepEqual(quotePillOf("pair", "NOICE", "/x.png"), { symbol: "NOICE", ticker: "NOIC", kind: "pair", logo: "/x.png" });
  for (const f of ["LaunchRow.tsx", "LaunchCard.tsx", "LaunchTape.tsx", "MeDashboard.tsx", "TrendingStrip.tsx", "LaunchPreview.tsx"]) assert.match(src(`../../components/launchpad/${f}`), /<QuoteBrandBadge quoteKey=\{[^}]+\} symbol=\{[^}]+\} logo=\{[^}]+\}/, f);
});

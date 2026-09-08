import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { INTERVALS, MAX_CANDLE_BUCKETS, boundedCandleFrom, isInterval } from "./candles.ts";

const route = readFileSync(new URL("../../app/api/launch/candles/route.ts", import.meta.url), "utf8");
const queries = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const candleQuery = queries.slice(queries.indexOf("export async function getCandles("), queries.indexOf("export async function getCandleBaseline("));
const baselineQuery = queries.slice(queries.indexOf("export async function getCandleBaseline("), queries.indexOf("export async function getWalletSwaps("));
const walletQuery = queries.slice(queries.indexOf("export async function getWalletSwaps("), queries.indexOf("export async function getWalletTokens("));

// Compile only the handler, replacing every import with an explicit local fake.
// These tests never load server modules, fetch prices, or connect to a database.
function isolatedRoute(priorPrice: number | null) {
  let now = 1_800_000_037;
  const calls = { launch: 0, candles: [] as unknown[][], baseline: [] as unknown[][], wallet: [] as unknown[][] };
  const launch = { block_time: new Date((now - 365 * 86400) * 1000).toISOString(), quote_symbol: "USDG", quote_decimals: 6, quote_usd: 1, supply: "1000000000000000000000000000", start_tick: 391400 };
  const candle = { t: 1_800_000_000, open: 2, high: 3, low: 1, close: 2.5, volume: 7, trades: 2 };
  const walletSwaps = [{ t: now, is_buy: true, quote: "7000000" }];
  const values = new Map<string, unknown>();
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) } },
    viem: { isAddress: (value: string) => /^0x[0-9a-f]{40}$/i.test(value) },
    "@/lib/chainPublic": { isChainKey: (value: unknown) => value === "base" || value === "robinhood" },
    "@/lib/launchpad/candles": { INTERVALS, boundedCandleFrom, isInterval },
    "@/lib/launchpad/ethPrice": { ethUsd: async () => null },
    "@/lib/launchpad/queries": {
      getLaunch: async () => { calls.launch++; return launch; },
      getCandles: async (...args: unknown[]) => { calls.candles.push(args); return [candle]; },
      getCandleBaseline: async (...args: unknown[]) => { calls.baseline.push(args); return priorPrice; },
      getWalletSwaps: async (...args: unknown[]) => {
        calls.wallet.push(args);
        return walletSwaps.filter((swap) => swap.t <= Number(args[3]));
      },
    },
    "@/lib/launchpad/memo": {
      memo: async (key: string, _ttl: number, fn: () => Promise<unknown>) => {
        if (!values.has(key)) values.set(key, await fn());
        return values.get(key);
      },
    },
  };
  class SnapshotDate extends Date { static now() { return now * 1000; } }
  const compiled = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported = {} as { GET: (request: Request) => Promise<Response> };
  new Function("require", "exports", "Date", compiled)((id: string) => {
    assert.ok(Object.hasOwn(imports, id), `unexpected production import: ${id}`);
    return imports[id];
  }, exported, SnapshotDate);
  return { get: exported.GET, calls, candle, walletSwaps, advance: () => { now++; } };
}

test("candle handler preserves quote metadata and returns a bounded, correctly seeded snapshot", async () => {
  const { get, calls, candle } = isolatedRoute(42);
  const token = "0x" + "a".repeat(40);
  const response = await get(new Request(`https://example.test/api/launch/candles?chain=robinhood&token=${token.toUpperCase().replace("0X", "0x")}&interval=1m&from=1`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.from % 60, 0);
  assert.equal((Math.floor(body.asOf / 60) * 60 - body.from) / 60 + 1, MAX_CANDLE_BUCKETS);
  assert.deepEqual(body.baseline, { price: 42, hasPriorTrades: true });
  assert.deepEqual(body.quote, { symbol: "USDG", decimals: 6, usd: 1 });
  assert.equal(body.supply, 1e9);
  assert.deepEqual(body.candles, [candle]);
  assert.deepEqual(calls.candles, [["robinhood", token, 60, body.from, 6, body.asOf]]);
  assert.deepEqual(calls.baseline, [["robinhood", token, body.from, 6]]);
  assert.deepEqual(calls.wallet, []);
  assert.equal(body.mine, null);
});

test("candle handler uses launch only without a prior swap and retains cached asOf", async () => {
  const { get, calls, advance } = isolatedRoute(null);
  const request = new Request(`https://example.test/api/launch/candles?chain=base&token=0x${"b".repeat(40)}&interval=5m&from=1799999444`);
  const first = await (await get(request)).json();
  advance();
  const cached = await (await get(request)).json();
  assert.equal(first.from, 1799999400, "floor an incremental start to preserve full first-bucket OHLCV");
  assert.deepEqual(first.baseline, { price: first.launch.price, hasPriorTrades: false });
  assert.equal(cached.asOf, first.asOf, "cached data must not acquire a new freshness timestamp");
  assert.equal(calls.candles.length, 1);
  assert.equal(calls.baseline.length, 1);
});

test("candle handler rejects prototype interval names before server reads", async () => {
  const { get, calls } = isolatedRoute(null);
  for (const interval of ["constructor", "toString", "__proto__"]) {
    const response = await get(new Request(`https://example.test/api/launch/candles?chain=base&token=0x${"b".repeat(40)}&interval=${interval}`));
    assert.equal(response.status, 400);
  }
  assert.equal(calls.launch, 0);
  assert.equal(calls.candles.length, 0);
});

test("wallet markers retain the cached candle cutoff when a new trade arrives in the same bucket", async () => {
  const { get, calls, walletSwaps, advance } = isolatedRoute(42);
  const token = `0x${"b".repeat(40)}`;
  const wallet = `0x${"c".repeat(40)}`;
  const request = new Request(`https://example.test/api/launch/candles?chain=base&token=${token}&interval=5m&from=1799999444&wallet=${wallet}`);
  const first = await (await get(request)).json();
  assert.deepEqual(first.mine, [walletSwaps[0]], "include a trade exactly at the snapshot cutoff");
  advance();
  walletSwaps.push({ t: first.asOf + 1, is_buy: false, quote: "3000000" });
  const cached = await (await get(request)).json();
  assert.equal(cached.asOf, first.asOf);
  assert.deepEqual(cached.candles, first.candles);
  assert.deepEqual(cached.mine, first.mine, "a newer same-bucket marker must wait for refreshed OHLCV");
  assert.equal(calls.candles.length, 1, "the second request must exercise the snapshot cache");
  assert.deepEqual(calls.wallet, [
    ["base", token, wallet, first.asOf],
    ["base", token, wallet, first.asOf],
  ]);
});

test("wallet marker query parameterizes its snapshot cutoff and rejects non-finite cutoffs", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: parts.join("?"), values });
    return [{ t: "1800000037", is_buy: true, quote: "7000000" }];
  };
  const compiled = ts.transpileModule(walletQuery, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported = {} as { getWalletSwaps: (chain: string, token: string, wallet: string, asOf: number, limit?: number) => Promise<unknown[]> };
  new Function("exports", "maybeDb", "chainIdOf", compiled)(exported, () => db, () => 8453);
  const token = `0x${"A".repeat(40)}`;
  const wallet = `0x${"B".repeat(40)}`;
  const rows = await exported.getWalletSwaps("base", token, wallet, 1_800_000_037, 900);
  assert.deepEqual(rows, [{ t: 1_800_000_037, is_buy: true, quote: "7000000" }]);
  assert.deepEqual(calls[0].values, [8453, token.toLowerCase(), wallet.toLowerCase(), 1_800_000_037, 500]);
  assert.match(calls[0].sql, /chain_id = \? AND token = \? AND trader = \?\s+AND block_time <= to_timestamp\(\?\)/);
  assert.match(calls[0].sql, /ORDER BY block_number DESC, log_index DESC LIMIT \?/);
  for (const cutoff of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(await exported.getWalletSwaps("base", token, wallet, cutoff), []);
  }
  assert.equal(calls.length, 1, "invalid cutoffs must never reach SQL");
});

test("candle API bounds whole buckets before fetching and returns the memoized snapshot time", () => {
  assert.match(route, /const from = boundedCandleFrom\(fromRaw, launchT, requestedAt, intervalS\)/);
  assert.match(route, /const asOf = requestedAt/);
  assert.match(route, /getCandles\(chain, token, intervalS, from, q\.decimals, asOf\)/);
  assert.match(route, /getCandleBaseline\(chain, token, from, q\.decimals\)/);
  assert.match(route, /return \{ candles, priorPrice, asOf \}/);
  assert.match(route, /asOf: snapshot\.asOf, baseline/);
  assert.match(route, /price: snapshot\.priorPrice \?\? launchPrice, hasPriorTrades: snapshot\.priorPrice !== null/);
  assert.match(route, /"cache-control": "no-store"/);
});

test("OHLCV query scopes the chain and token and includes complete buckets through asOf", () => {
  assert.match(candleQuery, /chain_id = \$\{chainIdOf\(chain\)\} AND token = \$\{token\.toLowerCase\(\)\}/);
  assert.match(candleQuery, /block_time >= to_timestamp\(\$\{from\}\) AND block_time <= to_timestamp\(\$\{asOf\}\)/);
  assert.match(candleQuery, /array_agg\(p ORDER BY block_number, log_index\)/);
  assert.match(candleQuery, /array_agg\(p ORDER BY block_number DESC, log_index DESC\)/);
  assert.match(candleQuery, /sum\(v\)::text AS volume, count\(\*\)::int AS trades/);
  assert.match(candleQuery, /volume: units\(r\.volume, quoteDecimals\)/);
});

test("baseline query selects one prior indexed swap, scoped by chain and token in full chain order", () => {
  assert.match(baselineQuery, /chain_id = \$\{chainIdOf\(chain\)\} AND token = \$\{token\.toLowerCase\(\)\}/);
  assert.match(baselineQuery, /block_time < to_timestamp\(\$\{from\}\)/);
  assert.match(baselineQuery, /ORDER BY block_number DESC, log_index DESC LIMIT 1/);
  assert.match(baselineQuery, /quotePerToken\(BigInt\(rows\[0\]\.sqrt_price_x96\), quoteDecimals\) : null/);
  assert.doesNotMatch(baselineQuery, /sum\(|count\(|array_agg\(/);
});

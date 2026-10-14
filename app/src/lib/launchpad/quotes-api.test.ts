import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { isChainKey, type ChainKey } from "../chainPublic.ts";
import { BASE_STOCKS, BASE_STOCK_SEARCH_LIMIT, pricedBaseStocks, searchBaseStocks, stockTileSvg } from "./baseStocks.ts";
import { STOCK_SOURCE, launchpad } from "./config.ts";
import { searchStocks } from "./stocks.ts";
import { gitlawbLinkedUsd } from "./twig.ts";

const route = readFileSync(new URL("../../app/api/quotes/route.ts", import.meta.url), "utf8");

const PRICED = ["AAPLc", "AMZNc", "COINc", "CRCLc", "GOOGLc", "INTCc", "METAc", "MSFTc", "MSTRc", "NVDAc", "SNDKc", "SPCXc", "TSLAc"];
type Hit = { key: string; address: string; symbol: string; name: string; decimals: number; usd: number | null; logo: string | null };

// Compile only the handler and hand it explicit imports: the registry, search and ranking are the real modules, the
// server ones (prices, the Robinhood registry fetch, GITLAWB's price, the memo) are local fakes. No network, no database.
function isolatedRoute(robinhoodRegistry: number | null = 30) {
  const calls = { registry: 0, prices: [] as { chain: string; addresses: string[] }[] };
  const robinhood = robinhoodRegistry === null ? null : Array.from({ length: robinhoodRegistry }, (_, i) => ({ chain: "robinhood" as ChainKey, address: "0x" + (i + 1).toString(16).padStart(40, "0"), symbol: `RH${String(i).padStart(2, "0")}`, name: `Robinhood ${i}`, decimals: 18, logo: null }));
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) } },
    "@/lib/chainPublic": { isChainKey },
    "@/lib/launchpad/config": { launchpad },
    "@/lib/launchpad/stocksServer": {
      STOCK_SOURCE,
      ensureRegistry: async () => { calls.registry++; return robinhood ? { list: robinhood } : null; },
      stockList: (chain: ChainKey) => (chain === "base" ? BASE_STOCKS.map((s) => ({ chain, address: s.address, symbol: s.symbol, name: s.name, decimals: s.decimals, logo: stockTileSvg(s.symbol) })) : chain === "robinhood" ? (robinhood ?? []) : []),
      // like the real one on Base: a dollar price for a stock with a feed, nothing for the rest
      stockPrices: async (chain: ChainKey, addresses: string[]) => {
        calls.prices.push({ chain, addresses });
        return new Map<string, number | null>(chain === "base" ? pricedBaseStocks(addresses).map((s) => [s.address, 100 + s.symbol.length]) : addresses.map((a) => [a, 7]));
      },
    },
    "@/lib/launchpad/stocks": { searchStocks },
    "@/lib/launchpad/baseStocks": { BASE_STOCK_SEARCH_LIMIT, searchBaseStocks, stockTileSvg },
    "@/lib/launchpad/memo": { memo: async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn() },
    "@/lib/launchpad/gitlawbServer": { gitlawbUsd: async () => 0.002 },
    "@/lib/launchpad/twig": { gitlawbLinkedUsd },
  };
  const compiled = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported = {} as { GET: (request: Request) => Promise<Response> };
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(Object.hasOwn(imports, id), `unexpected production import: ${id}`);
    return imports[id];
  }, exported);
  const get = async (query: string) => {
    const response = await exported.GET(new Request(`https://example.test/api/quotes?${query}`));
    return { response, body: (await response.json()) as { fixed: { key: string; usd: number | null }[]; stocks: Hit[]; stocksTotal: number; stocksMatched: number; error?: string } };
  };
  return { get, calls };
}

test("base, empty search: the first page is the 13 priced stocks, and the total says 146 are listed", async () => {
  const { get, calls } = isolatedRoute();
  const { response, body } = await get("chain=base");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(body.stocks.map((s) => s.symbol), PRICED);
  assert.equal(body.stocksTotal, 146);
  assert.equal(body.stocksMatched, 146, "an empty search matches the whole registry");
  for (const s of body.stocks) {
    assert.deepEqual(Object.keys(s).sort(), ["address", "decimals", "key", "logo", "name", "symbol", "usd"], "the stock shape the form reads, nothing else");
    assert.equal(s.key, "stock");
    assert.equal(s.decimals, 8);
    assert.ok(s.logo?.startsWith("data:image/svg+xml,"));
    assert.equal(s.usd, 100 + s.symbol.length);
  }
  assert.deepEqual(calls.prices, [{ chain: "base", addresses: body.stocks.map((s) => s.address) }], "prices are asked for the page shown, not for the registry");
  assert.equal(calls.registry, 0, "the Base list is static: Robinhood's registry is not fetched");
  assert.ok(body.fixed.some((q) => q.key === "eth"), "the fixed quotes still come along");
});

test("base, search: a newly listed stock is found by ticker or name; without a feed its USD is null, never a guess", async () => {
  const { get } = isolatedRoute();
  const byTicker = (await get("chain=base&q=nflx")).body;
  assert.deepEqual(byTicker.stocks.map((s) => [s.symbol, s.name, s.address, s.usd]), [["NFLXc", "Netflix", "0xb20000000000000000000058b8c947e44011dfe6", null]]);
  assert.equal(byTicker.stocksTotal, 146);
  assert.equal(byTicker.stocksMatched, 1);
  assert.deepEqual((await get("chain=base&q=berkshire%20hathaway%20class%20b")).body.stocks.map((s) => s.symbol), ["BRK.Bc"], "the query is cut to 12 characters and still finds it");
  const u = (await get("chain=base&q=u")).body.stocks;
  assert.equal(u[0].symbol, "Uc", "a one-letter ticker leads its longer namesakes");
  assert.equal(u.length, BASE_STOCK_SEARCH_LIMIT, "a broad search is capped at one page");
  // ...and says how many it left out: "S" has more ticker matches alone than one page holds (the review's SOUNc / STZc case)
  const s = (await get("chain=base&q=s")).body;
  assert.equal(s.stocks.length, BASE_STOCK_SEARCH_LIMIT);
  assert.equal(s.stocksMatched, searchBaseStocks("s", Infinity).length);
  assert.ok(s.stocksMatched > 15 && s.stocksMatched < 146);
  assert.ok(!s.stocks.some((x) => x.symbol === "STZc") && searchBaseStocks("s", Infinity).some((x) => x.symbol === "STZc"), "STZc matches but is off the page");
  const mixed = (await get("chain=base&q=pl")).body.stocks;
  assert.equal(mixed.find((s) => s.symbol === "AAPLc")?.usd, 105);
  assert.equal(mixed.find((s) => s.symbol === "PLTRc")?.usd, null);
});

test("base, no match: an empty page with the total, so the form can say what to search for", async () => {
  const { get } = isolatedRoute();
  const { body } = await get("chain=base&q=zzz");
  assert.deepEqual(body.stocks, []);
  assert.equal(body.stocksTotal, 146);
  assert.equal(body.stocksMatched, 0);
});

test("arc has no stock registry: no stocks, total 0, nothing looked up", async () => {
  const { get, calls } = isolatedRoute();
  const { body } = await get("chain=arc");
  assert.deepEqual(body.stocks, []);
  assert.equal(body.stocksTotal, 0);
  assert.equal(body.stocksMatched, 0);
  assert.deepEqual(calls, { registry: 0, prices: [] });
});

test("robinhood: one page of twelve from its own registry with that registry's total; none when the registry is unavailable", async () => {
  const up = isolatedRoute(30);
  const { body } = await up.get("chain=robinhood");
  assert.equal(body.stocks.length, 12);
  assert.equal(body.stocksTotal, 30);
  assert.equal(body.stocksMatched, 30);
  assert.ok(body.stocks.every((s) => s.key === "stock" && s.usd === 7 && s.decimals === 18));
  assert.equal(up.calls.registry, 1);
  const narrowed = (await up.get("chain=robinhood&q=rh0")).body;
  assert.equal(narrowed.stocks.length, 10, "RH00 to RH09");
  assert.equal(narrowed.stocksMatched, 10);
  const down = isolatedRoute(null);
  const none = (await down.get("chain=robinhood")).body;
  assert.deepEqual(none.stocks, []);
  assert.equal(none.stocksTotal, 0);
  assert.equal(none.stocksMatched, 0);
  assert.deepEqual(down.calls.prices, []);
});

test("an unknown chain is refused", async () => {
  const { get } = isolatedRoute();
  const { response, body } = await get("chain=solana");
  assert.equal(response.status, 400);
  assert.equal(body.error, "bad chain");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isAddress } from "viem";
import { BASE_STOCKS, BASE_STOCK_MAX_FEED_AGE_S, BASE_STOCK_SEARCH_LIMIT, baseStockByAddress, feedUsd, isB20Address, isB20RpcError, issuedFromSupply, parseRoundData, pricedBaseStocks, responseHasB20Error, searchBaseStocks, stockTileSvg, underlyingTicker } from "./baseStocks.ts";

const symbols = (list: readonly { symbol: string }[]) => list.map((s) => s.symbol);
/** The 13 stocks Chainlink publishes a "Coinbase <TICKER>" feed for on Base. */
const PRICED = ["AAPLc", "AMZNc", "COINc", "CRCLc", "GOOGLc", "INTCc", "METAc", "MSFTc", "MSTRc", "NVDAc", "SNDKc", "SPCXc", "TSLAc"];
const NFLX = "0xb20000000000000000000058b8c947e44011dfe6"; // NFLXc: in the registry, no feed

test("registry: 146 Coinbase stocks, unique symbols and lowercase B20 addresses, 8 decimals, plain names, sorted by ticker", () => {
  assert.equal(BASE_STOCKS.length, 146);
  assert.equal(new Set(BASE_STOCKS.map((s) => s.address)).size, 146);
  assert.equal(new Set(symbols(BASE_STOCKS)).size, 146);
  for (const s of BASE_STOCKS) {
    assert.equal(s.address, s.address.toLowerCase(), `${s.symbol} address stored lowercase`);
    assert.ok(isB20Address(s.address), `${s.symbol} is a B20 address`);
    assert.equal(s.decimals, 8);
    assert.match(s.symbol, /^[A-Z]{1,5}(\.[A-Z])?c$/, `${s.symbol}: a ticker ("U", "GOOGL", "BRK.B") and the issuer's "c"`);
    assert.match(s.name, /^[A-Za-z0-9 .&'!-]{2,40}$/, `${s.symbol} name is short plain text`);
  }
  const tickers = BASE_STOCKS.map((s) => underlyingTicker(s.symbol));
  assert.deepEqual(tickers, [...tickers].sort(), "rows are sorted by underlying ticker");
});

test("price feeds: 13 stocks have a Chainlink feed (unique, checksummed, an ordinary contract); the other 133 have none", () => {
  const priced = BASE_STOCKS.filter((s) => s.feed !== null);
  assert.deepEqual(symbols(priced), PRICED);
  assert.equal(new Set(priced.map((s) => s.feed!.toLowerCase())).size, 13);
  for (const s of priced) {
    assert.ok(isAddress(s.feed!, { strict: true }), `${s.symbol} feed passes the EIP-55 checksum (a mistyped character fails it)`);
    assert.ok(!isB20Address(s.feed!), "feed is a normal contract");
  }
  assert.equal(BASE_STOCKS.filter((s) => s.feed === null).length, 133);
  assert.ok(priced.length <= BASE_STOCK_SEARCH_LIMIT, "every priced stock fits on the picker's first page");
});

// Token addresses are stored lowercase, so no checksum guards them: this hash does. It covers symbol, address and feed of
// every row. When it fails, check the changed rows against Coinbase's list (api.coinbase.com/v1/tokenized-stocks) and
// against Base (symbol() and decimals() at the address), then put the new hash here.
test("registry digest: a row changes only together with this hash", () => {
  const digest = createHash("sha256").update(BASE_STOCKS.map((s) => `${s.symbol} ${s.address} ${s.feed ?? "-"}`).join("\n")).digest("hex");
  assert.equal(digest, "e41ed6ad7a323c9156d67028b96b26cb0aa2c3f37ef571886a162ffaeb8664c4");
});

test("baseStockByAddress is case-insensitive and rejects unknown/lookalike addresses", () => {
  assert.equal(baseStockByAddress("0xb20000000000000000000078ee7ce2fE4908108C")?.symbol, "NVDAc");
  assert.equal(baseStockByAddress("0xB20000000000000000000078EE7CE2FE4908108C")?.symbol, "NVDAc");
  assert.equal(baseStockByAddress("0xb20000000000000000000078ee7ce2fe4908108d"), null, "one nibble off");
  assert.equal(baseStockByAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"), null, "USDG is not a stock");
  // stocks added with the full list: one a launch was already quoted in, one spelled the way Coinbase's API spells it
  assert.equal(baseStockByAddress("0xb2000000000000000000008d5328e9208773dc58")?.symbol, "NVOc");
  assert.equal(baseStockByAddress("0xB200000000000000000000082f7FEA8F2eE8f438")?.symbol, "BJc");
  assert.equal(baseStockByAddress(NFLX)?.name, "Netflix");
  assert.equal(baseStockByAddress("0xb200000000000000000000c85a31389d71f3ecfb")?.symbol, "COINc", "kept: live launches are quoted in it");
  assert.equal(baseStockByAddress("0xb2000000000000000000004c27f6523082f41d01"), null, "a live B20 token on Base that Coinbase did not issue");
});

test("isB20Address: prefix only, never a stock decision", () => {
  assert.equal(isB20Address("0xb200000000000000000000ffffffffffffffffff"), true, "unknown B20 → shape ok, registry says no");
  assert.equal(baseStockByAddress("0xb200000000000000000000ffffffffffffffffff"), null);
  assert.equal(isB20Address("0xb2000000000000000000000000000000000000000"), false, "41 chars");
  assert.equal(isB20Address("0x0000000000000000000000000000000000000000"), false);
});

test("searchBaseStocks: ticker, full symbol or company name; $ tolerated; capped", () => {
  assert.deepEqual(symbols(searchBaseStocks("nvda")), ["NVDAc"]);
  assert.deepEqual(symbols(searchBaseStocks("nvdac")), ["NVDAc"], "the full symbol, issuer suffix included");
  assert.deepEqual(symbols(searchBaseStocks("$TSLA")), ["TSLAc"]);
  assert.deepEqual(symbols(searchBaseStocks("apple")), ["AAPLc"]);
  assert.deepEqual(symbols(searchBaseStocks("netflix")), ["NFLXc"]);
  assert.deepEqual(symbols(searchBaseStocks(" Berkshire ")), ["BRK.Bc"]);
  assert.deepEqual(symbols(searchBaseStocks("brk.b")), ["BRK.Bc"]);
  assert.deepEqual(symbols(searchBaseStocks("papa john's")), ["PZZAc"], "apostrophes are the plain ASCII one");
  assert.equal(searchBaseStocks("").length, 12, "empty query lists up to the cap");
  assert.equal(searchBaseStocks("", 500).length, 146, "and the whole registry when the cap allows");
  assert.equal(searchBaseStocks("zzz").length, 0);
});

test("searchBaseStocks ranks: symbol prefix, then substring; priced stocks lead within each, the rest keep ticker order", () => {
  // an empty search is the picker's first page: exactly the stocks with a live USD price, then the rest by ticker
  assert.deepEqual(symbols(searchBaseStocks("", BASE_STOCK_SEARCH_LIMIT)), PRICED);
  assert.deepEqual(symbols(searchBaseStocks("", 500).slice(13, 16)), ["AAOIc", "AEOc", "AMCc"]);
  // a one-letter ticker is found by its letter, ahead of every longer ticker that starts with it
  assert.deepEqual(symbols(searchBaseStocks("u").slice(0, 5)), ["Uc", "UBERc", "ULc", "UNHc", "USDEc"]);
  assert.deepEqual(symbols(searchBaseStocks("w").slice(0, 3)), ["Wc", "WDCc", "WENc"]);
  assert.equal(searchBaseStocks("uc")[0].symbol, "Uc");
  // three prefixes in ticker order, then substring matches with the priced one (AAPL) first
  assert.deepEqual(symbols(searchBaseStocks("pl").slice(0, 4)), ["PLc", "PLNTc", "PLTRc", "AAPLc"]);
  // among prefixes the priced stocks lead, the rest keep ticker order
  assert.deepEqual(symbols(searchBaseStocks("a").slice(0, 4)), ["AAPLc", "AMZNc", "AAOIc", "AEOc"]);
  // every symbol ends in the issuer's "c": a "c" must not match all 146 by that suffix
  const c = symbols(searchBaseStocks("c", 500));
  assert.deepEqual(c.slice(0, 3), ["COINc", "CRCLc", "CAKEc"]);
  assert.ok(c.length < 146 && !c.includes("Uc") && !c.includes("NFLXc"));
});

test("pricedBaseStocks: a price is read only for registry stocks that have a feed", () => {
  const nvda = "0xB20000000000000000000078EE7CE2FE4908108C";
  const unknown = "0xb200000000000000000000ffffffffffffffffff";
  assert.deepEqual(symbols(pricedBaseStocks([nvda, NFLX, unknown, "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"])), ["NVDAc"]);
  assert.deepEqual(pricedBaseStocks([NFLX, unknown]), [], "no feed, or not in the registry: nothing to read");
  assert.deepEqual(pricedBaseStocks([]), []);
  assert.deepEqual(symbols(pricedBaseStocks(BASE_STOCKS.map((s) => s.address))), PRICED);
});

test("parseRoundData decodes latestRoundData words and negative answers", () => {
  const w = (n: bigint) => (n < 0n ? (n + (1n << 256n)).toString(16) : n.toString(16)).padStart(64, "0");
  const hex = "0x" + w(1n) + w(22996000000n) + w(1_700_000_000n) + w(1_700_000_100n) + w(1n);
  assert.deepEqual(parseRoundData(hex), { answer: 22996000000n, updatedAt: 1_700_000_100 });
  assert.equal(parseRoundData("0x" + w(1n) + w(-5n) + w(0n) + w(1n) + w(1n))?.answer, -5n);
  assert.equal(parseRoundData("0x1234"), null);
});

test("feedUsd: 8-dec answer → USD; stale, future, zero or negative → null", () => {
  const now = 1_700_100_000;
  assert.equal(feedUsd({ answer: 22996000000n, updatedAt: now - 3600 }, now), 229.96);
  assert.equal(feedUsd({ answer: 22996000000n, updatedAt: now - 2 * 24 * 3600 }, now), 229.96, "weekend hold is fine");
  assert.equal(feedUsd({ answer: 22996000000n, updatedAt: now - BASE_STOCK_MAX_FEED_AGE_S - 1 }, now), null, "too old");
  assert.equal(feedUsd({ answer: 22996000000n, updatedAt: now + 60 }, now), null, "future round (clock skew / bad RPC) is not a price");
  assert.equal(feedUsd({ answer: 22996000000n, updatedAt: now + BASE_STOCK_MAX_FEED_AGE_S }, now), null, "far-future round is not a price either");
  assert.equal(feedUsd({ answer: 0n, updatedAt: now }, now), null);
  assert.equal(feedUsd({ answer: -1n, updatedAt: now }, now), null);
  assert.equal(feedUsd(null, now), null);
});

test("issuedFromSupply: supply above zero is issued, zero is not, a failed or odd read says nothing", () => {
  const [a, b, c, d] = BASE_STOCKS.slice(0, 4).map((s) => s.address);
  const out = issuedFromSupply([a.toUpperCase().replace("0X", "0x"), b, c, d], [
    { status: "success", result: 12_345n },
    { status: "success", result: 0n },
    { status: "failure" },
    { status: "success", result: "0" },
  ]);
  assert.deepEqual(Object.fromEntries(out), { [a]: true, [b]: false }, "keys are lowercase; c failed and d is not a uint");
  assert.equal(issuedFromSupply([a, b], [{ status: "success", result: 1n }]).has(b), false, "a missing read says nothing");
});

test("B20 RPC error detection (single + batch)", () => {
  assert.equal(isB20RpcError("EVM error OpcodeNotFound"), true);
  assert.equal(isB20RpcError("execution reverted"), false);
  assert.equal(isB20RpcError(undefined), false);
  assert.equal(responseHasB20Error({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "EVM error OpcodeNotFound" } }), true);
  assert.equal(responseHasB20Error([{ id: 1, result: "0x" }, { id: 2, error: { message: "EVM error OpcodeNotFound" } }]), true);
  assert.equal(responseHasB20Error([{ id: 1, result: "0x" }, { id: 2, error: { message: "execution reverted" } }]), false);
  assert.equal(responseHasB20Error({ id: 1, result: "0x" }), false);
  assert.equal(responseHasB20Error(null), false);
});

test("stockTileSvg: inline SVG data URL, blue tile, underlying ticker, safe against odd input", () => {
  const u = stockTileSvg("NVDAc");
  assert.ok(u.startsWith("data:image/svg+xml,"));
  const svg = decodeURIComponent(u.slice("data:image/svg+xml,".length));
  assert.ok(svg.includes('fill="#0052FF"'), "Base blue");
  assert.ok(svg.includes(">NVDA<"), "underlying ticker, no trailing c");
  assert.equal(underlyingTicker("GOOGLc"), "GOOGL");
  for (const s of BASE_STOCKS) assert.ok(decodeURIComponent(stockTileSvg(s.symbol)).includes(`>${underlyingTicker(s.symbol)}<`), s.symbol);
  assert.ok(decodeURIComponent(stockTileSvg("Uc")).includes(">U<"), "a one-letter ticker");
  assert.ok(decodeURIComponent(stockTileSvg("BRK.Bc")).includes(">BRK.B<"), "a class share keeps its dot");
  assert.ok(Math.max(...BASE_STOCKS.map((s) => stockTileSvg(s.symbol).length)) < 600, "every tile stays small");
  assert.ok(decodeURIComponent(stockTileSvg("<script>c")).includes(">SCRIP<"), "markup stripped (and capped at 5), never injected");
  assert.ok(decodeURIComponent(stockTileSvg("")).includes(">?<"));
  assert.ok(u.length < 600, "small enough to inline everywhere");
});

import "server-only";
import { maybeDb } from "@/lib/db";
import { b20Client, publicClient } from "@/lib/chain";
import { CHAIN_KEYS, chainKeyOf, type ChainKey } from "@/lib/chainPublic";
import { STOCK_PRICE_URL, STOCK_REGISTRY_URL, parseRegistry, stockUsd, type StockQuote } from "./stocks";
import { BASE_STOCKS, feedUsd, issuedFromSupply, pricedBaseStocks, stockTileSvg } from "./baseStocks";

/**
 * Stock quote assets, server-side only. Two registries, one shape:
 *   - robinhood: Robinhood Stock Tokens from Robinhood's registry (fetched, parsed defensively,
 *     cached 10 min); prices from Robinhood's quote API, cached 30s, only for quotes in use.
 *   - base: Coinbase tokenized stocks (B20) from the static list in baseStocks.ts (Coinbase's registry);
 *     prices from Chainlink's on-chain feeds via one multicall, cached 60s. A stock without a feed
 *     has no USD price and no read is made for it.
 * An address is a stock ONLY if it is in a registry (never trust on-chain names).
 * Everything fails soft: on error the last good copy stays; with none, stocks are simply not
 * offered and existing stock-quoted launches show no USD.
 */
/** `priced`: something prices the stock in USD (every Robinhood Stock Token; on Base only the stocks with a Chainlink feed). */
export type Stock = { chain: ChainKey; address: string; symbol: string; name: string; decimals: number; logo: string | null; priced: boolean };

type Cache = { at: number; list: StockQuote[]; byAddress: Map<string, StockQuote> };
let registry: Cache | null = null;
let registryInflight: Promise<Cache | null> | null = null;
const REGISTRY_TTL = 10 * 60_000;
const prices = new Map<string, { at: number; usd: number | null }>(); // key: `${chain}:${address}`
const PRICE_TTL: Record<ChainKey, number> = { robinhood: 30_000, base: 60_000, arc: 60_000 /* no stocks there; never consulted */ };

async function fetchRegistry(): Promise<Cache | null> {
  try {
    const res = await fetch(STOCK_REGISTRY_URL, { headers: { accept: "application/json", "user-agent": "openlaunch.lol" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!res.ok) throw new Error(`registry ${res.status}`);
    const list = parseRegistry(await res.json());
    if (list.length === 0) throw new Error("registry empty");
    return { at: Date.now(), list, byAddress: new Map(list.map((s) => [s.address, s])) };
  } catch (err) {
    console.warn("[stocks] registry fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Ensure the Robinhood registry copy exists (refreshing in the background when stale). Cheap when warm. */
export async function ensureRegistry(): Promise<Cache | null> {
  const stale = !registry || Date.now() - registry.at > REGISTRY_TTL;
  if (!registry) {
    registryInflight ??= fetchRegistry().finally(() => (registryInflight = null));
    registry = (await registryInflight) ?? registry;
  } else if (stale && !registryInflight) {
    registryInflight = fetchRegistry()
      .then((c) => {
        if (c) registry = c;
        return c;
      })
      .finally(() => (registryInflight = null));
  }
  return registry;
}

/** Where a chain's tokenized stocks come from (client-safe, in config.ts so the form can hide the Stock quote where there are none). */
import { STOCK_SOURCE } from "./config";
export { STOCK_SOURCE, type StockSource } from "./config";

/** The Base list never changes at run time, so its rows (each with a tile logo) are built once per chain that uses it, not on every call. */
const baseRows = new Map<ChainKey, { list: readonly Stock[]; byAddress: Map<string, Stock> }>();
function baseStocksFor(chain: ChainKey) {
  let rows = baseRows.get(chain);
  if (!rows) {
    const list = BASE_STOCKS.map((s): Stock => ({ chain, address: s.address, symbol: s.symbol, name: s.name, decimals: s.decimals, logo: stockTileSvg(s.symbol), priced: s.feed !== null }));
    rows = { list, byAddress: new Map(list.map((s) => [s.address, s])) };
    baseRows.set(chain, rows);
  }
  return rows;
}

/** Synchronous registry lookup for any chain (call ensureRegistry() first in the request for robinhood). The row is shared: read it, do not change it. */
export function stockByAddress(chain: ChainKey, address: string): Stock | null {
  const a = address.toLowerCase();
  if (STOCK_SOURCE[chain] === "coinbase-b20") return baseStocksFor(chain).byAddress.get(a) ?? null;
  if (STOCK_SOURCE[chain] !== "robinhood-registry") return null;
  const s = registry?.byAddress.get(a);
  return s ? { chain, address: s.address, symbol: s.symbol, name: s.name, decimals: s.decimals, logo: s.logo, priced: true } : null;
}

export function stockList(chain: ChainKey): readonly Stock[] {
  if (STOCK_SOURCE[chain] === "coinbase-b20") return baseStocksFor(chain).list;
  if (STOCK_SOURCE[chain] !== "robinhood-registry") return [];
  return (registry?.list ?? []).map((s) => ({ chain, address: s.address, symbol: s.symbol, name: s.name, decimals: s.decimals, logo: s.logo, priced: true }));
}

async function fetchRobinhoodPrice(s: StockQuote): Promise<number | null> {
  try {
    const res = await fetch(STOCK_PRICE_URL(s.symbol), { headers: { accept: "application/json", "user-agent": "openlaunch.lol" }, signal: AbortSignal.timeout(6_000), cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { quotes?: { tokenSymbol?: string; bid?: string; ask?: string; isTradingHalt?: boolean }[] };
    const q = j.quotes?.find((x) => x.tokenSymbol === s.symbol) ?? j.quotes?.[0];
    return stockUsd(q, s.multiplier);
  } catch {
    return null;
  }
}

const AGGREGATOR_ABI = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] },
] as const;

/** Chainlink feeds for a set of Base stock addresses in one multicall (feeds are ordinary contracts: any RPC works). Stocks without a feed are left out. */
async function fetchBasePrices(addresses: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const stocks = pricedBaseStocks(addresses);
  if (stocks.length === 0) return out;
  try {
    const res = await publicClient("base").multicall({
      contracts: stocks.map((s) => ({ address: s.feed as `0x${string}`, abi: AGGREGATOR_ABI, functionName: "latestRoundData" as const })),
      allowFailure: true,
    });
    const nowS = Math.floor(Date.now() / 1000);
    stocks.forEach((s, i) => {
      const r = res[i];
      out.set(s.address, r.status === "success" ? feedUsd({ answer: r.result[1], updatedAt: Number(r.result[3]) }, nowS) : null);
    });
  } catch (err) {
    console.warn("[stocks] chainlink multicall failed:", err instanceof Error ? err.message : err);
  }
  return out;
}

const SUPPLY_ABI = [{ type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;

/**
 * Which Base stocks Coinbase has issued (address → supply above zero), so the launch form can mark the ones nobody holds yet.
 * One multicall of totalSupply() over the whole list on the B20-capable node, cached 10 min: a cold cache waits for the read,
 * a stale one answers the last good copy and refreshes behind it, and a failed read keeps that copy and is retried after a
 * minute, not on every request. With no good read yet the map is empty and no stock is marked either way.
 */
type Supply = { at: number; issued: ReadonlyMap<string, boolean> };
let supply: Supply | null = null;
let supplyInflight: Promise<void> | null = null;
const SUPPLY_TTL = 10 * 60_000;
const SUPPLY_RETRY = 60_000;
const NO_SUPPLY_INFO: ReadonlyMap<string, boolean> = new Map();

async function refreshBaseSupply(chain: ChainKey): Promise<void> {
  const list = baseStocksFor(chain).list;
  let issued: Map<string, boolean> | null = null;
  try {
    const res = await b20Client().multicall({
      contracts: list.map((s) => ({ address: s.address as `0x${string}`, abi: SUPPLY_ABI, functionName: "totalSupply" as const })),
      allowFailure: true,
    });
    issued = issuedFromSupply(list.map((s) => s.address), res);
    if (issued.size === 0) throw new Error("every totalSupply read failed");
  } catch (err) {
    console.warn("[stocks] supply multicall failed:", err instanceof Error ? err.message : err);
    issued = null;
  }
  supply = issued ? { at: Date.now(), issued } : { at: Date.now() - SUPPLY_TTL + SUPPLY_RETRY, issued: supply?.issued ?? NO_SUPPLY_INFO };
}

/** Issued or not, per stock address, where known. Only Coinbase's B20 stocks (Base) are read: every other chain answers an empty map. */
export async function stockIssued(chain: ChainKey): Promise<ReadonlyMap<string, boolean>> {
  if (STOCK_SOURCE[chain] !== "coinbase-b20") return NO_SUPPLY_INFO;
  if (!supply || Date.now() - supply.at >= SUPPLY_TTL) {
    supplyInflight ??= refreshBaseSupply(chain).finally(() => (supplyInflight = null));
    if (!supply) await supplyInflight;
  }
  return supply?.issued ?? NO_SUPPLY_INFO;
}

/** USD per token for stock addresses on a chain (cached per chain TTL). */
export async function stockPrices(chain: ChainKey, addresses: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const wanted = [...new Set(addresses.map((a) => a.toLowerCase()))].filter((a) => stockByAddress(chain, a));
  if (wanted.length === 0) return out;
  const now = Date.now();
  const miss: string[] = [];
  for (const a of wanted) {
    const hit = prices.get(`${chain}:${a}`);
    if (hit && now - hit.at < PRICE_TTL[chain]) out.set(a, hit.usd);
    else miss.push(a);
  }
  if (miss.length === 0) return out;
  const fresh = new Map<string, number | null>();
  if (STOCK_SOURCE[chain] === "coinbase-b20") for (const [a, v] of await fetchBasePrices(miss)) fresh.set(a, v);
  else if (STOCK_SOURCE[chain] === "robinhood-registry") {
    const reg = await ensureRegistry();
    await Promise.all(
      miss.map(async (a) => {
        const s = reg?.byAddress.get(a);
        fresh.set(a, s ? await fetchRobinhoodPrice(s) : null);
      }),
    );
  }
  for (const a of miss) {
    const prev = prices.get(`${chain}:${a}`);
    const usd = fresh.get(a) ?? prev?.usd ?? null; // keep the last good price through a transient failure
    prices.set(`${chain}:${a}`, { at: now, usd });
    out.set(a, usd);
  }
  return out;
}

/** Stock addresses currently used as quotes by launches, per chain (so pricing stays bounded). */
export async function stockQuotesInUse(): Promise<Record<ChainKey, string[]>> {
  const out = Object.fromEntries(CHAIN_KEYS.map((k) => [k, [] as string[]])) as Record<ChainKey, string[]>;
  const db = maybeDb();
  if (!db) return out;
  const rows = await db<{ chain_id: number; quote: string }[]>`SELECT DISTINCT chain_id, quote FROM bb_launches`;
  await ensureRegistry();
  for (const r of rows) {
    const chain = chainKeyOf(r.chain_id);
    if (chain && stockByAddress(chain, r.quote)) out[chain].push(r.quote);
  }
  return out;
}

/** Warm every stock price in use on every chain; returns an address-keyed USD map (addresses never collide across chains). */
export async function stockUsdInUse(): Promise<Map<string, number | null>> {
  const inUse = await stockQuotesInUse();
  const maps = await Promise.all((Object.keys(inUse) as ChainKey[]).map((c) => stockPrices(c, inUse[c])));
  const out = new Map<string, number | null>();
  for (const m of maps) for (const [a, v] of m) out.set(a, v);
  return out;
}

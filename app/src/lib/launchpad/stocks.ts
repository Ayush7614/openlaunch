/**
 * Pure logic for Robinhood Stock Token quotes (node --test loads this directly).
 * The site treats an address as a stock ONLY if it appears in Robinhood's own
 * registry (api.robinhood.com/rhj/assets) for chain 4663 — never by name/symbol
 * read from a contract, which anyone can fake.
 */
export const ROBINHOOD_CHAIN_ID = 4663;
export const STOCK_REGISTRY_URL = "https://api.robinhood.com/rhj/assets";
export const STOCK_PRICE_URL = (symbol: string) => `https://api.robinhood.com/rhj/prices/${encodeURIComponent(symbol)}`;

export type StockQuote = { address: string; symbol: string; name: string; decimals: number; multiplier: number; logo: string | null };

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const SYM = /^[A-Z0-9.\-]{1,12}$/;

/** Parse the registry payload defensively: only active, 4663 deployments, sane symbols/decimals/multipliers, https logos. */
export function parseRegistry(json: unknown): StockQuote[] {
  const items: unknown[] = Array.isArray(json) ? json : Array.isArray((json as { assets?: unknown[] })?.assets) ? (json as { assets: unknown[] }).assets : [];
  const out: StockQuote[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const a = raw as Record<string, unknown>;
    if (a.status !== "ASSET_STATUS_ACTIVE") continue;
    const symbol = typeof a.tokenSymbol === "string" ? a.tokenSymbol.trim().toUpperCase() : "";
    if (!SYM.test(symbol)) continue;
    const deps = Array.isArray(a.deployments) ? (a.deployments as Record<string, unknown>[]) : [];
    const dep = deps.find((d) => Number(d.chainId) === ROBINHOOD_CHAIN_ID && typeof d.contractAddress === "string" && ADDR.test(d.contractAddress));
    if (!dep) continue;
    const address = (dep.contractAddress as string).toLowerCase();
    if (seen.has(address)) continue;
    const decimals = Number(a.tokenDecimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) continue;
    const multiplier = Number(a.currentMultiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1000) continue;
    const logo = typeof a.logoUrl === "string" && /^https:\/\//.test(a.logoUrl) ? a.logoUrl.slice(0, 300) : null;
    const name = typeof a.tokenName === "string" ? a.tokenName.replace(/\s*•\s*Robinhood Token\s*$/i, "").trim().slice(0, 64) : symbol;
    seen.add(address);
    out.push({ address, symbol, name: name || symbol, decimals, multiplier, logo });
  }
  return out.sort((x, y) => x.symbol.localeCompare(y.symbol));
}

/** Token-equivalent USD from a price quote: mid of bid/ask × corporate-action multiplier. Null when the quote is unusable. */
export function stockUsd(q: { bid?: unknown; ask?: unknown; isTradingHalt?: unknown } | null | undefined, multiplier: number): number | null {
  if (!q) return null;
  const bid = Number(q.bid);
  const ask = Number(q.ask);
  const vals = [bid, ask].filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length === 0) return null;
  const mid = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (vals.length === 2 && ask < bid) return null; // crossed quote → distrust
  return mid * multiplier;
}

/** Simple ticker search over the registry: prefix on symbol first, then substring on name. */
export function searchStocks(list: StockQuote[], q: string, limit = 12): StockQuote[] {
  const n = q.trim().toUpperCase().replace(/^\$/, "");
  if (!n) return list.slice(0, limit);
  const pre = list.filter((s) => s.symbol.startsWith(n));
  const sub = list.filter((s) => !s.symbol.startsWith(n) && (s.symbol.includes(n) || s.name.toUpperCase().includes(n)));
  return [...pre, ...sub].slice(0, limit);
}

/** Start-market-cap presets for a stock quote, expressed in stock units from USD targets. */
export function stockMcapPresets(stockUsdPrice: number, usdTargets = [5_000, 10_000, 25_000, 100_000]): number[] {
  if (!(stockUsdPrice > 0)) return [];
  return usdTargets.map((u) => u / stockUsdPrice);
}

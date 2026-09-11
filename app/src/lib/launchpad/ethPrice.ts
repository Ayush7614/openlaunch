import "server-only";

/**
 * ETH/USD spot, 60s memo, null when unavailable (UI then shows ETH only).
 *
 * Stale-while-revalidate with a poisoning guard: a non-200 response, a body
 * without a usable amount, or a thrown fetch/parse error keeps the last good
 * price instead of overwriting it with null. Before this guard a single
 * Coinbase 429 (or an HTML error page that parses to `{}`) blanked every USD
 * figure on the site — layout, home, token pages, list/live/search/me APIs
 * and the GITLAWB USD derivation — for a full TTL. Failures still advance
 * the timestamp so a down upstream is retried at most once per TTL instead
 * of on every request.
 */
export const ETH_SPOT_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot";
export const ETH_PRICE_TTL_MS = 60_000;
export const ETH_FETCH_TIMEOUT_MS = 5_000;

let cached: { at: number; usd: number | null } = { at: 0, usd: null };

/** Test-only: drop the memo so each case starts cold. */
export function resetEthPriceCache(): void {
  cached = { at: 0, usd: null };
}

/** Pull a positive finite USD number out of a Coinbase spot body; null when unusable. */
export function parseEthSpot(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const amount = (body as { data?: { amount?: unknown } }).data?.amount;
  if (typeof amount !== "string") return null;
  const v = Number(amount);
  return Number.isFinite(v) && v > 0 ? v : null;
}

type FetchFn = (
  input: string,
  init?: RequestInit & { next?: { revalidate: number } },
) => Promise<Response>;

export async function ethUsd(
  opts: { fetchFn?: FetchFn; now?: () => number } = {},
): Promise<number | null> {
  const now = opts.now ?? Date.now;
  if (now() - cached.at < ETH_PRICE_TTL_MS) return cached.usd;
  const fetchFn: FetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init as RequestInit));
  try {
    const res = await fetchFn(ETH_SPOT_URL, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(ETH_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      cached = { at: now(), usd: cached.usd };
      return cached.usd;
    }
    const v = parseEthSpot(await res.json());
    cached = { at: now(), usd: v ?? cached.usd };
  } catch {
    cached = { at: now(), usd: cached.usd };
  }
  return cached.usd;
}

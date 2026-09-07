import "server-only";

/** ETH/USD spot, 60s memo, null when unavailable (UI then shows ETH only). */
let cached: { at: number; usd: number | null } = { at: 0, usd: null };

export async function ethUsd(): Promise<number | null> {
  if (Date.now() - cached.at < 60_000) return cached.usd;
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { next: { revalidate: 60 } });
    const j = (await res.json()) as { data?: { amount?: string } };
    const v = Number(j.data?.amount);
    cached = { at: Date.now(), usd: Number.isFinite(v) && v > 0 ? v : null };
  } catch {
    cached = { at: Date.now(), usd: cached.usd };
  }
  return cached.usd;
}

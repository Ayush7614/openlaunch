import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { CHAIN_LABELS, isChainKey, shortAddr } from "@/lib/chainPublic";
import { fmtShare } from "@/lib/launchpad/holders";
import { marketUsd } from "@/lib/launchpad/market-format";
import { fmtUnitsExact } from "@/lib/launchpad/math";
import { LAUNCH_TOKEN_DECIMALS } from "@/lib/launchpad/metrics";
import { getLaunchMetrics } from "@/lib/launchpad/metricsServer";
import { pageMetadata, tokenPath } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Title, description and canonical for one launch's details page. */
export async function generateMetadata({ params }: { params: Promise<{ chain: string; token: string }> }): Promise<Metadata> {
  const { chain, token } = await params;
  if (!isChainKey(chain) || !isAddress(token)) return { title: "Launch not found" };
  const m = await getLaunchMetrics(chain, token);
  if (!m) return { title: "Launch not found" };
  return pageMetadata({
    path: `/launch/details/${m.chain}/${m.token}`,
    title: `${m.name} (${m.symbol}) launch details`,
    description: `Holders, trades, volume and fees for ${m.name} (${m.symbol}) on ${CHAIN_LABELS[m.chain]}, read from the openlaunch indexer.`,
  });
}

/** One launch's metrics: holders, supply, trades, volume, fees and the wallets holding most of it. */
export default async function LaunchDetailsPage({ params }: { params: Promise<{ chain: string; token: string }> }) {
  const { chain, token } = await params;
  if (!isChainKey(chain) || !isAddress(token)) notFound();
  const m = await getLaunchMetrics(chain, token);
  if (!m) notFound();

  const count = (n: number) => n.toLocaleString("en-US");
  const usd = (v: number | null) => (v === null ? "—" : marketUsd(v));
  const symbol = m.symbol;

  return (
    <main className="relative mx-auto max-w-6xl px-4 pt-6 sm:pt-10 pb-16 space-y-5 sm:space-y-6">
      <header className="max-w-2xl">
        <p className="text-sm text-muted">
          <Link href={tokenPath(m.chain, m.token)} className="hover:text-ink">
            {m.name} ({symbol})
          </Link>
          <span aria-hidden="true"> · </span>
          {CHAIN_LABELS[m.chain]}
        </p>
        <h1 className="mt-2 font-display font-bold tracking-[-0.02em] text-ink text-3xl sm:text-4xl">Launch details</h1>
        <p className="mt-2 text-base text-body">
          <span className="font-mono">{shortAddr(m.token)}</span> · every trade, fee and holder the indexer holds for this launch
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Cell k="Holders" v={m.holders === null ? "—" : count(m.holders)} sub={m.synced ? "wallets holding it, the pool aside" : "the transfer history is still indexing"} />
        <Cell k="Supply" v={`${count(m.supply_tokens)} ${symbol}`} sub="fixed at launch, never minted again" />
        <Cell k="Trades" v={count(m.trades)} sub="buys and sells, all time" />
        <Cell k="Volume" v={usd(m.volume_usd)} sub={m.volume_usd === null ? `nothing prices ${m.quote_symbol} yet` : "each trade at its own hour's price"} />
        <Cell k="Fees collected" v={usd(m.fees_collected_usd)} sub={`collected in ${m.quote_symbol}`} />
        <Cell k="Fees burned" v={usd(m.fees_burned_usd)} sub={`burned in ${m.quote_symbol}`} />
      </dl>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
        <h2 className="font-display text-base font-semibold text-ink">Top holders</h2>
        <p className="mt-1 text-sm text-muted">The five largest wallets, with the pool and the protocol&apos;s own addresses left out.</p>
        {!m.synced ? (
          <p className="mt-4 text-sm text-muted">The transfer history is still indexing, so this ranking is incomplete. Check back in a minute.</p>
        ) : m.topHolders.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No holders yet.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {m.topHolders.map((h, i) => (
              <li key={h.address} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-muted tnum">{i + 1}.</span> <span className="font-mono text-ink">{shortAddr(h.address)}</span>
                </span>
                <span className="shrink-0 text-body tnum" title={`${fmtUnitsExact(h.balance, LAUNCH_TOKEN_DECIMALS)} ${symbol}`}>
                  {fmtShare(h.bps)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-sm text-muted">
        {m.synced ? `The ten largest wallets hold ${fmtShare(m.top10Bps)} of supply; the locked pool holds ${fmtShare(m.poolBps)}. ` : null}
        <Link href={tokenPath(m.chain, m.token)} className="underline decoration-line-strong underline-offset-4 hover:text-ink">
          The full token page
        </Link>{" "}
        has the chart, the trades and the receipts.
      </p>
    </main>
  );
}

function Cell({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <dt className="text-sm text-muted">{k}</dt>
      <dd className="mt-1">
        <span className="block font-display text-2xl font-bold text-ink tnum">{v}</span>
        <span className="mt-1 block text-xs text-faint">{sub}</span>
      </dd>
    </div>
  );
}

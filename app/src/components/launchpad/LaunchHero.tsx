import Link from "next/link";
import { btn, pill } from "@/components/ui";
import LiveTotals from "./LiveTotals";
import { launchpad } from "@/lib/launchpad/config";
import { explorerAddress } from "@/lib/chainPublic";

export default function LaunchHero({ configured }: { ethUsd?: number | null; configured: boolean }) {
  const b = launchpad("base");
  const r = launchpad("robinhood");
  return (
    <section className="relative pt-8 sm:pt-12 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${pill} text-up border-up/20 bg-up-soft`}>0% platform fee</span>
        <a href="/rules#contracts" className={`${pill} hover:text-ink hover:border-line-strong`}>
          open source · verified contracts
        </a>
        <span className={pill}>Base + Robinhood Chain · Uniswap v4</span>
        <span className={pill}>liquidity locked forever</span>
        <span className={pill}>no owner, no admin</span>
      </div>

      <div className="mt-6 sm:mt-8 grid lg:grid-cols-[minmax(0,1fr)_24rem] gap-8 lg:gap-12 items-end">
        <div className="min-w-0">
          <h1 className="font-display font-bold leading-[0.98] tracking-[-0.03em] text-ink text-5xl sm:text-6xl lg:text-7xl break-words">
            Launch a token.
            <br />
            <span className="text-brand">Free.</span> On Base or Robinhood.
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-body max-w-xl">
            One transaction deploys your token, opens a Uniswap v4 pool and locks 100% of the supply as liquidity — forever. We take nothing. The only cost is gas.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <Link href="/launch" className={`${btn.primary} w-full sm:w-auto min-h-12 px-7 text-[15px]`}>
              Launch a token
              <span aria-hidden className="ml-1">→</span>
            </Link>
            <Link href="/rules#launchpad" className="text-sm font-medium text-brand hover:underline underline-offset-4 text-center sm:text-left">
              How it works
            </Link>
          </div>
          {!configured ? (
            <p className="mt-5 inline-block rounded-xl bg-warm-soft border border-warm/30 text-warm-ink text-sm px-3 py-2">
              Launchpad contracts are not configured yet — read-only until NEXT_PUBLIC_LAUNCH_FACTORY / _LOCKER are set.
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <LiveTotals />
          <p className="mt-3 text-xs text-muted leading-relaxed">
            Liquidity lives in Uniswap&apos;s PoolManager; the position NFT in an ownerless locker on each chain (
            {b.locker ? (
              <a href={explorerAddress("base", b.locker)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                Base
              </a>
            ) : (
              "Base"
            )}
            ,{" "}
            {r.locker ? (
              <a href={explorerAddress("robinhood", r.locker)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                Robinhood
              </a>
            ) : (
              "Robinhood"
            )}
            ). Nobody can pull it — not the creator, not us.
          </p>
        </div>
      </div>
    </section>
  );
}

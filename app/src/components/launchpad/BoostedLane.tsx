"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import TokenAvatar from "./TokenAvatar";
import { TwigMark } from "./TwigBadge";
import { useLive } from "./LiveProvider";
import type { BoostLane } from "@/lib/launchpad/boostServer";
import { BOOST_COPY, BOOST_LANE_SIZE, boostTimeLeft, fmtBoostTwig } from "@/lib/launchpad/boost";
import { capDisplay } from "@/lib/launchpad/market-cap";
import { explorerTx } from "@/lib/chainPublic";
import { setPendingToken } from "@/lib/launchpad/token-transition";

/**
 * The Boosted lane: tokens someone sent TWIG to 0x…dEaD for, most TWIG in the last 24 hours first (boost.ts). A paid,
 * labelled surface of its own, never mixed into the Live sort or the Trending board. Renders nothing while the BOOST
 * switch is off; the shared live poll carries the lane, and a poll from a machine that predates it keeps what is shown.
 */
export default function BoostedLane({ initial, serverNow }: { initial: BoostLane; serverNow: number }) {
  const { subscribe } = useLive();
  const [lane, setLane] = useState(initial);
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const unsubscribe = subscribe((snap) => {
      if (snap.boost) setLane(snap.boost);
    });
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      unsubscribe();
      clearInterval(clock);
    };
  }, [subscribe]);

  if (!lane.enabled) return null;
  // a boost that ran out between polls leaves at once rather than showing "0m left"
  const items = lane.items.filter((b) => boostTimeLeft(b.last_at, now) !== null);
  return (
    <section id="boosted" aria-labelledby="boosted-heading" className="scroll-mt-24 rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="boosted-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <TwigMark size={16} className="rounded-[4px]" />
          {BOOST_COPY.laneTitle}
        </h2>
        <p className="min-w-0 text-pretty text-[11px] leading-relaxed text-muted">{BOOST_COPY.laneNote}</p>
      </div>
      {/* the whole rule, in place: no page to keep in step with the switch */}
      <details className="group border-b border-line px-4 sm:px-5">
        <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-1 text-[11px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden">How boosts work<ChevronDown size={12} aria-hidden="true" className="group-open:rotate-180" /></summary>
        <div className="max-w-3xl space-y-1.5 pb-3 text-pretty text-[11px] leading-relaxed text-body">
          <p>{BOOST_COPY.what}</p>
          <p>{BOOST_COPY.how} {BOOST_COPY.tag}</p>
          <p>{BOOST_COPY.final}</p>
        </div>
      </details>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-xs leading-relaxed text-muted sm:px-5">{BOOST_COPY.laneEmpty}</p>
      ) : (
        <ol aria-label="Boosted tokens" className="grid gap-px overflow-hidden rounded-b-2xl bg-line sm:grid-cols-2 lg:grid-cols-5">
          {items.map((b, i) => {
            const l = b.launch;
            // two columns from 640px: an odd last card takes the whole row instead of leaving a hole
            const lastOdd = i === items.length - 1 && items.length % 2 === 1;
            const cap = capDisplay(l.fdv_quote, l.quote_usd, { key: l.quote_key, symbol: l.quote_symbol, decimals: l.quote_decimals }).compact;
            const left = boostTimeLeft(b.last_at, now);
            return (
              <li key={l.token} className={`flex min-w-0 flex-col gap-2 bg-card px-4 py-3 ${lastOdd ? "sm:col-span-2 lg:col-span-1" : ""}`}>
                <Link
                  href={`/t/${l.chain}/${l.token}`}
                  onClick={() => setPendingToken({ chain: l.chain, token: l.token, name: l.name, symbol: l.symbol, image: l.image_url })}
                  className="group flex min-w-0 items-center gap-2.5"
                >
                  <TokenAvatar chain={l.chain} token={l.token} symbol={l.symbol} image={l.image_url} size={32} className="shrink-0 rounded-xl" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink group-hover:underline group-hover:underline-offset-2">{l.name}</span>
                    <span className="block truncate text-[11px] text-muted"><span className="font-mono text-body">{l.symbol}</span><span aria-hidden="true"> · </span><span className="sr-only">, market cap </span><span className="font-mono tnum">{cap}</span></span>
                  </span>
                </Link>
                <p className="flex min-w-0 items-baseline justify-between gap-2 text-[11px]">
                  <span className="truncate font-mono text-warm-ink tnum" title={`${b.boosts} ${b.boosts === 1 ? "boost" : "boosts"} from ${b.boosters} ${b.boosters === 1 ? "wallet" : "wallets"} in the last 24 hours`}>{fmtBoostTwig(b.twig)}</span>
                  <span className="shrink-0 text-muted" suppressHydrationWarning>{left}</span>
                </p>
                <a href={explorerTx(l.chain, b.last_tx)} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-0.5 text-[10px] text-muted hover:text-ink">
                  Latest burn<ArrowUpRight size={10} aria-hidden="true" />
                </a>
              </li>
            );
          })}
          {/* five columns from 1024px: the free places read as open, never as a grey block */}
          {Array.from({ length: Math.max(0, BOOST_LANE_SIZE - items.length) }, (_, i) => (
            <li key={`open-${i}`} aria-hidden="true" className="hidden items-center justify-center bg-card px-4 py-3 text-[11px] text-faint lg:flex">Open spot</li>
          ))}
        </ol>
      )}
    </section>
  );
}

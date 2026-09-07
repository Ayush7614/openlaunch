"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLive } from "./LiveProvider";
import TokenAvatar from "./TokenAvatar";
import type { FeedItem } from "@/lib/launchpad/queries";
import { fmtQuote } from "@/lib/launchpad/math";
import ChainBadge from "./ChainBadge";
import { shortAddr } from "@/lib/chainPublic";
import { ago } from "@/lib/launchpad/time";

/** Live tape of launches + trades, fed by LiveProvider. New rows flash once. */
export default function LaunchTape({ initial }: { initial: FeedItem[] }) {
  const { subscribe } = useLive();
  const [items, setItems] = useState<FeedItem[]>(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set(initial.map(key)));
  const [now, setNow] = useState(() => Date.now());

  useEffect(
    () =>
      subscribe((snap) => {
        const incoming = snap.feed ?? [];
        const newOnes = new Set(incoming.filter((i) => !seen.current.has(key(i))).map(key));
        incoming.forEach((i) => seen.current.add(key(i)));
        setItems(incoming);
        if (newOnes.size) {
          setFresh(newOnes);
          setTimeout(() => setFresh(new Set()), 2000);
        }
      }),
    [subscribe],
  );

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(clock);
  }, []);

  return (
    <section className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
      <div className="px-4 h-11 flex items-center justify-between border-b border-line">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-up opacity-60 bb-pulse" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
          </span>
          Live
        </h2>
        <span className="text-[11px] text-muted">launches &amp; trades</span>
      </div>
      <ul className="divide-y divide-line max-h-[34rem] overflow-y-auto bb-scroll">
        {items.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted">Nothing yet. The first launch shows up here.</li> : null}
        {items.map((i) => {
          const k = key(i);
          const isFresh = fresh.has(k);
          return (
            <li key={k} className={`px-4 py-2.5 ${isFresh ? (i.kind === "swap" && !i.is_buy ? "bb-flash-down" : "bb-flash-up") : ""}`}>
              <Link href={`/t/${i.chain}/${i.token}`} className="flex items-center gap-2.5 min-w-0">
                <TokenAvatar token={i.token} symbol={i.symbol} image={i.image_url} size={28} />
                <div className="min-w-0 flex-1 text-[13px] leading-tight">
                  {i.kind === "launch" ? (
                    <div className="truncate">
                      <span className="font-semibold text-ink">{i.name}</span> <span className="text-muted">launched</span>
                      <span className="ml-1 font-mono text-[11px] text-muted">{i.lp_fee === 0 ? "0% fee" : ""}</span>
                    </div>
                  ) : (
                    <div className="truncate">
                      <span className={`font-semibold ${i.is_buy ? "text-up" : "text-down-ink"}`}>{i.is_buy ? "Buy" : "Sell"}</span>{" "}
                      {i.is_dev ? <span className={`inline-flex items-center h-4 px-1 mr-1 rounded border text-[10px] font-bold uppercase tracking-wide ${i.is_buy ? "border-brand/40 bg-brand-soft text-brand" : "border-warm/40 bg-warm-soft text-warm-ink"}`}>dev</span> : null}
                      <span className="font-mono tnum text-ink">{fmtQuote(i.quote_wei, i.quote_decimals, i.quote_symbol)}</span> <span className="text-muted">of</span>{" "}
                      <span className="font-semibold text-ink">{i.symbol}</span>
                    </div>
                  )}
                  <div className="text-[11px] text-muted font-mono truncate flex items-center gap-1.5">
                    <ChainBadge chain={i.chain} />
                    {shortAddr(i.kind === "launch" ? i.launcher : i.trader)}
                  </div>
                </div>
                <span className="font-mono text-[11px] text-faint tnum shrink-0" suppressHydrationWarning>{ago(i.at, now)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function key(i: FeedItem): string {
  return `${i.kind}:${i.tx_hash}:${i.token}${i.kind === "swap" ? `:${i.quote_wei}` : ""}`;
}

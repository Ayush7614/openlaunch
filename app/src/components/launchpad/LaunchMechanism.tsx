"use client";

import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useLive } from "./LiveProvider";
import { fmtUsd } from "@/lib/launchpad/math";
import { BRAND_GITHUB } from "@/lib/brand";

/** Real network totals sit outside the illustrative launch, never inside it. */
export default function LaunchMechanism() {
  const { live } = useLive();
  const t = live.totals;
  const count = (value: number) => value.toLocaleString("en-US");
  return <div className="border-t border-line pt-4">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <span className="text-[11px] text-muted">Open by design. Free by construction.</span>
      <a href={`${BRAND_GITHUB}/tree/main/contracts/src`} target="_blank" rel="noreferrer" className="flex min-h-8 shrink-0 items-center gap-1 text-xs text-ink hover:underline underline-offset-4"><span className="font-mono tnum">$0</span> platform fee <ArrowUpRight size={12} aria-hidden /></a>
    </div>
    <dl className="mt-4 grid grid-cols-3 gap-3">
      <Metric label="Tokens launched" value={count(t.launches)} />
      <Metric label="All-time volume" value={fmtUsd(t.volume_usd, { compact: true })} title={fmtUsd(t.volume_usd)} />
      <Metric label="Fees to recipients" value={fmtUsd(t.fees_to_creators_usd, { compact: true })} title={fmtUsd(t.fees_to_creators_usd)} />
    </dl>
    <details className="group mt-3">
      <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden">Across Base & Robinhood<ChevronDown size={12} aria-hidden className="group-open:rotate-180" /><span className="sr-only">. Show the network breakdown</span></summary>
      <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-dashed border-line-strong py-4 text-xs">
        <div><dt className="text-muted">Base launches</dt><dd className="mt-1 font-mono text-ink tnum">{count(t.by_chain.base.launches)}</dd></div>
        <div><dt className="text-muted">Robinhood launches</dt><dd className="mt-1 font-mono text-ink tnum">{count(t.by_chain.robinhood.launches)}</dd></div>
        <div><dt className="text-muted">All-time trades</dt><dd className="mt-1 font-mono text-ink tnum">{count(t.trades)}</dd></div>
        <div><dt className="text-muted">Fees burned</dt><dd className="mt-1 font-mono text-warm-ink tnum">{fmtUsd(t.fees_burned_usd)}</dd></div>
      </dl>
      <p className="pb-2 text-[11px] leading-relaxed text-muted">Creators choose a 0%, 1% or 3% trading fee. It goes to their named recipients or is burned. The platform takes none.</p>
    </details>
  </div>;
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return <div className="min-w-0"><dt className="min-h-7 sm:min-h-0 text-[10px] sm:text-[11px] text-muted">{label}</dt><dd title={title} className="mt-1.5 break-words font-mono text-xl sm:text-2xl font-bold tracking-[-0.05em] text-ink tnum">{value}</dd></div>;
}

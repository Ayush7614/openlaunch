import { ArrowDownLeft, ArrowUpRight, Activity } from "lucide-react";
import type { SwapRow } from "@/lib/launchpad/queries";
import { explorerAddress, explorerTx, shortAddr, type ChainKey } from "@/lib/chainPublic";
import { fmtCompact, fmtPrice, fmtQuote, fmtUsd } from "@/lib/launchpad/math";
import { ago } from "@/lib/launchpad/time";
import type { Quote } from "@/lib/launchpad/config";

export default function TokenTrades({ chain, symbol, quote, swaps, now }: { chain: ChainKey; symbol: string; quote: Quote; swaps: SwapRow[]; now: number }) {
  return <section aria-label="Indexed trades">
    <div className="flex min-h-11 items-center justify-between gap-3 px-5 text-[11px] text-muted"><span>Direct from the pool</span><span className="font-mono tnum">{swaps.length} recent swaps</span></div>
    {swaps.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 border-t border-line px-5 text-center"><Activity size={22} strokeWidth={1.4} className="mb-1 text-muted" /><h3 className="text-sm font-medium text-ink">The tape is quiet.</h3><p className="max-w-xs text-xs leading-relaxed text-muted text-pretty">No swaps have been indexed for this token yet. Confirmed trades appear here with an explorer link.</p></div> :
      <div className="max-h-[480px] overflow-auto bb-scroll" tabIndex={0} aria-label="Trade history">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 border-y border-line bg-card text-[11px] text-muted"><tr><th className="px-4 py-3 text-left font-medium">Side / trader</th><th className="px-4 py-3 text-right font-medium">{quote.symbol}</th><th className="hidden px-4 py-3 text-right font-medium sm:table-cell">{symbol}</th><th className="hidden px-4 py-3 text-right font-medium md:table-cell">Price</th><th className="px-4 py-3 text-right font-medium">Time</th></tr></thead>
          <tbody>{swaps.map((s) => { const q = BigInt(s.amount0); const t = BigInt(s.amount1); const Icon = s.is_buy ? ArrowDownLeft : ArrowUpRight; return <tr key={`${s.tx_hash}:${s.log_index}`} className="border-b border-line last:border-0 hover:bg-card">
            <td className="px-4 py-3"><span className={`flex items-center gap-1.5 font-medium ${s.is_buy ? "text-up" : "text-down-ink"}`}><Icon size={13} />{s.is_buy ? "Buy" : "Sell"}</span>{s.trader ? <a href={explorerAddress(chain, s.trader)} target="_blank" rel="noreferrer" className="mt-0.5 block font-mono text-[10px] text-muted hover:text-ink" title={s.trader}>{shortAddr(s.trader)}</a> : null}</td>
            <td className="px-4 py-3 text-right font-mono text-ink tnum">{fmtQuote(q < 0n ? -q : q, quote.decimals, "").trim()}</td>
            <td className="hidden px-4 py-3 text-right font-mono text-body tnum sm:table-cell">{fmtCompact(Number(t < 0n ? -t : t) / 1e18)}</td>
            <td className="hidden px-4 py-3 text-right font-mono text-muted tnum md:table-cell">{quote.usd !== null ? fmtUsd(s.price_quote * quote.usd) : `${fmtPrice(s.price_quote)} ${quote.symbol}`}</td>
            <td className="px-4 py-3 text-right font-mono text-muted tnum"><a href={explorerTx(chain, s.tx_hash)} target="_blank" rel="noreferrer" className="whitespace-nowrap hover:text-ink" title={new Date(s.block_time).toUTCString()}>{ago(s.block_time, now)} ↗</a></td>
          </tr>; })}</tbody>
        </table>
      </div>}
  </section>;
}

import { ArrowDown, ArrowUpRight, LockKeyhole } from "lucide-react";
import { launchpad } from "@/lib/launchpad/config";
import { explorerAddress, explorerTx, type ChainKey } from "@/lib/chainPublic";

/** A receipt of the launch mechanics, not a claim about current wallet balances. */
export default function LaunchReceipt({ chain, symbol, supply, txHash }: { chain: ChainKey; symbol: string; supply: string; txHash: string }) {
  const locker = launchpad(chain).locker;
  return <section className="overflow-hidden rounded-2xl border border-line bg-paper" aria-labelledby="receipt-title">
    <div className="flex min-h-12 items-center justify-between border-b border-line px-5"><h2 id="receipt-title" className="text-sm font-semibold text-ink">The launch receipt</h2><a href={explorerTx(chain, txHash)} target="_blank" rel="noreferrer" className="flex size-9 items-center justify-center text-muted hover:text-ink" aria-label="Verify the launch transaction"><ArrowUpRight size={16} /></a></div>
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-3"><span className="text-xs text-muted">Fixed supply</span><span className="truncate font-mono text-sm text-ink tnum" title={`${supply} ${symbol}`}>{supply} {symbol}</span></div>
      <div className="flex items-center gap-3 py-2 text-[10px] text-muted"><ArrowDown size={13} className="ml-1" /><span>100% deposited at launch</span></div>
      <a href={locker ? explorerAddress(chain, locker) : "/rules#contracts"} target={locker ? "_blank" : undefined} rel={locker ? "noreferrer" : undefined} className="flex items-center justify-between gap-3 rounded-xl border border-line-strong px-3 py-3 hover:bg-card">
        <div><span className="flex items-center gap-2 text-xs font-medium text-ink"><LockKeyhole size={13} /> Liquidity position</span><span className="mt-1 block text-[11px] text-muted">Ownerless locker · read the code ↗</span></div><span className="font-mono text-xs font-bold text-up">Forever</span>
      </a>
      <div className="mt-4 flex items-center justify-between border-t border-dashed border-line-strong pt-4"><span className="text-xs text-muted line-through decoration-faint">Platform fee</span><span className="font-mono text-xl font-bold text-up tnum">$0</span></div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted text-pretty">No withdrawal key. No platform cut. This does not prevent token prices from falling.</p>
    </div>
  </section>;
}

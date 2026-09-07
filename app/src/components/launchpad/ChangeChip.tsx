import { fmtCompact } from "@/lib/launchpad/math";

/** "+12%" / "-3.4%" since launch. Plain component: renders on the server and the client. */
export default function ChangeChip({ v, className = "" }: { v: number; className?: string }) {
  const pct = v * 100;
  const up = pct >= 0;
  const txt = `${up ? "+" : ""}${Math.abs(pct) >= 1000 ? fmtCompact(pct, 0) : pct.toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%`;
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 h-5 text-[11px] font-mono font-bold tnum ${up ? "bg-up-soft text-up" : "bg-down-soft text-down-ink"} ${className}`} title="since launch">
      {txt}
    </span>
  );
}

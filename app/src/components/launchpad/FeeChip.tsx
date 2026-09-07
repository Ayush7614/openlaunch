import { pipsToPct } from "@/lib/launchpad/math";

/**
 * One glance at the fee routing: "0% fee" (free pool), "1% → burned", "1% → creator".
 * Burn is the no-beneficiary default the factory registers; creator/others come from the locker recipients.
 */
export type FeeMode = "free" | "burn" | "creator" | "split";

export function feeModeOf(lpFee: number, recipients?: { payout: string; bps: number }[] | null): FeeMode {
  if (lpFee === 0) return "free";
  if (!recipients || recipients.length === 0) return "burn";
  const dead = "0x000000000000000000000000000000000000dead";
  if (recipients.length === 1) return recipients[0].payout.toLowerCase() === dead ? "burn" : "creator";
  return "split";
}

export default function FeeChip({ lpFee, mode, className = "" }: { lpFee: number; mode: FeeMode; className?: string }) {
  const base = "inline-flex items-center gap-1 rounded-full border px-2 h-6 text-[11px] font-medium whitespace-nowrap";
  if (mode === "free")
    return (
      <span className={`${base} border-up/25 bg-up-soft text-up ${className}`} title="0% trading fee. Nobody earns anything on trades.">
        0% fee
      </span>
    );
  if (mode === "burn")
    return (
      <span className={`${base} border-warm/30 bg-warm-soft text-warm-ink ${className}`} title={`${pipsToPct(lpFee)} trading fee, burned in full. No beneficiary.`}>
        {pipsToPct(lpFee)} → burned
      </span>
    );
  return (
    <span className={`${base} border-line bg-card text-body ${className}`} title={`${pipsToPct(lpFee)} trading fee → ${mode === "split" ? "split between beneficiaries" : "the beneficiary"}`}>
      {pipsToPct(lpFee)} → {mode === "split" ? "split" : "beneficiary"}
    </span>
  );
}

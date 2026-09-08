import { GITLAWB_SYMBOL } from "@/lib/launchpad/gitlawb";

/** The Gitlawb mark (ring + planet + satellite), inline so it renders in server and client components alike. */
export function GitlawbMark({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <ellipse cx="50" cy="50" rx="44" ry="14" transform="rotate(-24 50 50)" fill="none" stroke="currentColor" strokeWidth="6" />
      <circle cx="50" cy="50" r="25" fill="currentColor" />
      <circle cx="90.19" cy="32.1" r="9" fill="#4d7dff" />
    </svg>
  );
}

/**
 * Badge for tokens paired with GITLAWB. Shown wherever a token appears (list, trending, feed, token page,
 * dashboard, share card) — the visible perk of picking GITLAWB as the quote asset.
 */
export default function GitlawbBadge({ size = "sm", className = "", label = GITLAWB_SYMBOL }: { size?: "sm" | "md"; className?: string; label?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-[#0a1020]/15 bg-[#0a1020] font-semibold whitespace-nowrap text-[#e8edf6] dark:border-[#e8edf6]/20 ${size === "md" ? "h-6 px-2 text-[11px]" : "h-5 px-1.5 text-[10px] tracking-wide"} ${className}`}
      title="Paired with GITLAWB: buyers pay in GITLAWB and trading fees are paid, or burned, in GITLAWB."
    >
      <GitlawbMark size={size === "md" ? 12 : 10} />
      {label}
    </span>
  );
}

/** True for a launch whose quote is GITLAWB (quote symbols come from the server registry, never from on-chain names). */
export function isGitlawbQuote(quoteSymbol: string | null | undefined): boolean {
  return quoteSymbol === GITLAWB_SYMBOL;
}

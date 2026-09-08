import { GITLAWB_LOGO_BG, GITLAWB_LOGO_PATH, GITLAWB_SYMBOL } from "@/lib/launchpad/gitlawb";

/** Gitlawb's logo (the real asset from gitlawb.com, served from our origin) as a small rounded tile. */
export function GitlawbMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={GITLAWB_LOGO_PATH} alt="" width={size} height={size} className={`shrink-0 rounded-[4px] ${className}`} style={{ background: GITLAWB_LOGO_BG }} />;
}

/**
 * Badge for tokens paired with GITLAWB. Shown wherever a token appears (list, trending, feed, token page,
 * dashboard, share card) — the visible perk of picking GITLAWB as the quote asset. Black like the logo's own
 * ground, white text, a light hairline in dark mode so it still reads as a chip on a dark page.
 */
export default function GitlawbBadge({ size = "sm", className = "", label = GITLAWB_SYMBOL }: { size?: "sm" | "md"; className?: string; label?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border border-black/10 font-semibold whitespace-nowrap text-white dark:border-white/25 ${size === "md" ? "h-6 gap-1.5 pl-1 pr-2 text-[11px]" : "h-5 gap-1 pl-0.5 pr-1.5 text-[10px] tracking-wide"} ${className}`}
      style={{ background: GITLAWB_LOGO_BG }}
      title="Paired with GITLAWB: buyers pay in GITLAWB and trading fees are paid, or burned, in GITLAWB."
    >
      <GitlawbMark size={size === "md" ? 18 : 16} />
      {label}
    </span>
  );
}

/** True for a launch whose quote is GITLAWB (quote symbols come from the server registry, never from on-chain names). */
export function isGitlawbQuote(quoteSymbol: string | null | undefined): boolean {
  return quoteSymbol === GITLAWB_SYMBOL;
}

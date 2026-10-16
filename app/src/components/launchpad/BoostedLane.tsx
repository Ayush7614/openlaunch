"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import TokenAvatar from "./TokenAvatar";
import { TwigMark } from "./TwigBadge";
import { useLive } from "./LiveProvider";
import LiveNumber from "@/components/LiveNumber";
import type { BoostLane } from "@/lib/launchpad/boostServer";
import { BOOST_COPY, BOOST_LANE_SIZE, boostFuse, boostIgnitions, boostTimeLeft, boostWholeOf, type BoostSource } from "@/lib/launchpad/boost";
import { capDisplay } from "@/lib/launchpad/market-cap";
import { explorerTx } from "@/lib/chainPublic";
import { setPendingToken } from "@/lib/launchpad/token-transition";

/** The rolling TWIG figure: "1.2M", "300K", like fmtBoostTwig (Intl rounds 999,999 up to "1M" by itself). */
const TWIG_FORMAT = { notation: "compact", maximumFractionDigits: 2 } as const;

/** Sparks that rise from the amount when a boost lands: offsets, delays and size. Decorative, a fixed set. */
const EMBERS: readonly { dx: number; dy: number; delay: number; size: number; ink?: boolean }[] = [
  { dx: -6, dy: -24, delay: 0, size: 4 },
  { dx: 3, dy: -32, delay: 90, size: 3, ink: true },
  { dx: 10, dy: -20, delay: 160, size: 3 },
  { dx: -1, dy: -28, delay: 240, size: 4, ink: true },
  { dx: 15, dy: -16, delay: 320, size: 3 },
];
/** An ignition is drawn for this long; older entries are dropped when the next one is recorded. */
const IGNITE_KEEP_MS = 10_000;

/**
 * The lane's beacon to /api/boost/seen: the lane came on screen, or a card was clicked. sendBeacon outlives the
 * navigation a click starts and never holds it up; fetch with keepalive where it is missing or refuses. Never throws.
 */
function sendSeen(body: { kind: "view" } | { kind: "click"; token: string }, source: BoostSource) {
  const data = JSON.stringify({ ...body, source });
  try {
    if (navigator.sendBeacon?.("/api/boost/seen", data)) return;
  } catch {
    // fall through to fetch
  }
  void fetch("/api/boost/seen", { method: "POST", body: data, keepalive: true }).catch(() => {});
}

/**
 * The Boosted lane: tokens someone sent TWIG to 0x…dEaD for, most TWIG in the last 24 hours first (boost.ts). A paid,
 * labelled surface of its own, never mixed into the Live sort or the Trending board. Renders nothing while the BOOST
 * switch is off. It asks the shared live poll for the lane while it is on screen (wantBoost); a poll without it is no
 * news, so the cards stay as they are.
 *
 * Motion follows the board above it: nothing moves on its own. Each card carries a fuse (the share of its 24 hours
 * left, stepped with the card's clock), and a card lights up once when a fresh boost lands on it: a warm ring, the
 * amount rolling up, a few embers. Places change with a short slide. A hover is the visitor's own doing: the card warms,
 * its edge and an arrow show, the fuse brightens.
 *
 * The whole card opens the token. The lane counts one view per page and each card click (sendSeen, /admin only); the
 * server counts a click only while the token is still in the lane.
 */
export default function BoostedLane({ initial, serverNow, source }: { initial: BoostLane; serverNow: number; source: BoostSource }) {
  const { subscribe, wantBoost } = useLive();
  const reduced = useReducedMotion();
  const [lane, setLane] = useState(initial);
  const [now, setNow] = useState(serverNow);
  // what each card held at the last snapshot: a token with more TWIG than this, freshly boosted, lights up
  const prev = useRef<Map<string, string> | null>(initial.enabled ? new Map(initial.items.map((i) => [i.token, i.twig])) : null);
  const [ignited, setIgnited] = useState<Record<string, number>>({});
  const section = useRef<HTMLElement>(null);
  const viewed = useRef(false);

  useEffect(() => wantBoost(), [wantBoost]);
  useEffect(() => {
    const unsubscribe = subscribe((snap) => {
      const next = snap.boost;
      if (!next) return;
      if (next.enabled) {
        const t = Date.now();
        const lit = boostIgnitions(prev.current, next.items, t);
        prev.current = new Map(next.items.map((i) => [i.token, i.twig]));
        if (lit.size > 0) {
          setIgnited((m) => {
            const kept = Object.fromEntries(Object.entries(m).filter(([, at]) => t - at < IGNITE_KEEP_MS));
            for (const token of lit) kept[token] = t;
            return kept;
          });
        }
      } else {
        prev.current = null;
      }
      setLane(next);
    });
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      unsubscribe();
      clearInterval(clock);
    };
  }, [subscribe]);

  // one view per page: the first time the lane, with cards in it, is a third on screen
  const hasCards = lane.enabled && lane.items.length > 0;
  useEffect(() => {
    const el = section.current;
    if (!hasCards || viewed.current || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (viewed.current || !entries.some((e) => e.isIntersecting)) return;
        viewed.current = true;
        io.disconnect();
        sendSeen({ kind: "view" }, source);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasCards, source]);

  if (!lane.enabled) return null;
  // a boost that ran out between polls leaves at once rather than showing "0m left"
  const items = lane.items.filter((b) => boostTimeLeft(b.last_at, now) !== null);
  return (
    <section ref={section} id="boosted" aria-labelledby="boosted-heading" className="scroll-mt-24 rounded-2xl border border-line bg-card">
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
            const cap = capDisplay(l.fdv_quote, l.quote_usd, { key: l.quote_key, symbol: l.quote_symbol, decimals: l.quote_decimals }).compact;
            const left = boostTimeLeft(b.last_at, now);
            const fuse = boostFuse(b.last_at, now);
            const lit = ignited[l.token];
            // two columns from 640px: an odd last card takes the whole row instead of leaving a hole
            const lastOdd = i === items.length - 1 && items.length % 2 === 1;
            // the whole card opens the token (the link's ::after covers it); only "Latest burn" sits above as its own link
            return (
              <motion.li
                key={l.token}
                layout={reduced ? false : "position"}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className={`group/card relative flex min-w-0 flex-col gap-2 bg-card px-4 pb-3.5 pt-3 transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--color-warm-soft)_70%,var(--color-card))] active:bg-warm-soft motion-reduce:transition-none ${lastOdd ? "sm:col-span-2 lg:col-span-1" : ""}`}
              >
                {/* one warm ring per ignition: a new key replays it */}
                {lit ? <span key={`ring-${lit}`} aria-hidden="true" className="bb-boost-ring pointer-events-none absolute inset-0" /> : null}
                {/* hover: a still warm edge and an arrow, only under a pointer that hovers; reduced motion keeps the colour */}
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-warm)_40%,transparent)] transition-opacity duration-150 group-hover/card:opacity-100 motion-reduce:transition-none" />
                <ArrowUpRight size={14} aria-hidden="true" className="pointer-events-none absolute right-3 top-3 text-warm-ink opacity-0 transition duration-150 group-hover/card:opacity-100 motion-safe:-translate-x-0.5 motion-safe:translate-y-0.5 motion-safe:group-hover/card:translate-x-0 motion-safe:group-hover/card:translate-y-0 motion-reduce:transition-none" />
                <Link
                  href={`/t/${l.chain}/${l.token}`}
                  title={`${b.boosts} ${b.boosts === 1 ? "boost" : "boosts"} from ${b.boosters} ${b.boosters === 1 ? "wallet" : "wallets"} in the last 24 hours`}
                  onClick={() => {
                    setPendingToken({ chain: l.chain, token: l.token, name: l.name, symbol: l.symbol, image: l.image_url });
                    sendSeen({ kind: "click", token: l.token }, source);
                  }}
                  // a middle click opens a tab without a click event
                  onAuxClick={(e) => {
                    if (e.button === 1) sendSeen({ kind: "click", token: l.token }, source);
                  }}
                  className="flex min-w-0 items-center gap-2.5 pr-5 outline-none after:absolute after:inset-0 after:z-[1] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand"
                >
                  <TokenAvatar chain={l.chain} token={l.token} symbol={l.symbol} image={l.image_url} size={32} className="shrink-0 rounded-xl transition-transform duration-150 motion-safe:group-hover/card:scale-105 motion-reduce:transition-none" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">{l.name}</span>
                    <span className="block truncate text-[11px] text-muted"><span className="font-mono text-body">{l.symbol}</span><span aria-hidden="true"> · </span><span className="sr-only">, market cap </span><span className="font-mono tnum">{cap}</span></span>
                  </span>
                </Link>
                <p className="flex min-w-0 items-baseline justify-between gap-2 text-[11px]">
                  <span className="relative truncate font-mono text-warm-ink tnum">
                    <LiveNumber value={Number(boostWholeOf(BigInt(b.twig)))} format={TWIG_FORMAT} suffix=" TWIG" />
                    {lit ? (
                      <span key={`embers-${lit}`} aria-hidden="true" className="pointer-events-none absolute bottom-1 left-2">
                        {EMBERS.map((e, k) => (
                          <span
                            key={k}
                            className="bb-ember absolute rounded-full"
                            style={{ "--dx": `${e.dx}px`, "--dy": `${e.dy}px`, width: e.size, height: e.size, animationDelay: `${e.delay}ms`, background: e.ink ? "var(--color-warm-ink)" : "var(--color-warm)" } as CSSProperties}
                          />
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-muted" suppressHydrationWarning>{left}</span>
                </p>
                <a href={explorerTx(l.chain, b.last_tx)} target="_blank" rel="noreferrer" className="relative z-[2] inline-flex w-fit items-center gap-0.5 text-[10px] text-muted hover:text-ink">
                  Latest burn<ArrowUpRight size={10} aria-hidden="true" />
                </a>
                {/* the fuse: what is left of the 24 hours, burning down from the right; steps with the card's clock */}
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-warm/10 transition-colors duration-150 group-hover/card:bg-warm/20 motion-reduce:transition-none">
                  <span className="relative block h-full bg-gradient-to-r from-warm/40 to-warm transition-[width] duration-1000 ease-linear group-hover/card:from-warm/70 motion-reduce:transition-none" style={{ width: `${(fuse * 100).toFixed(2)}%` }}>
                    {fuse > 0 ? <span className="absolute right-0 top-1/2 size-[5px] -translate-y-1/2 translate-x-1/2 rounded-full bg-warm shadow-[0_0_6px_var(--color-warm)] transition-shadow duration-150 group-hover/card:shadow-[0_0_10px_var(--color-warm)] motion-reduce:transition-none" /> : null}
                  </span>
                </span>
              </motion.li>
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

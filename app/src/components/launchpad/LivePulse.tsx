"use client";

import { useEffect, useState } from "react";

type Pulse = { visits: number; online: number };

function compact(n: number): string {
  if (n < 10_000) return n.toLocaleString("en-US");
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

/**
 * "12,480 visits · 3 online". Sends a cookie-free beacon on mount and every 30s
 * (only while the tab is visible), then shows the live numbers. `initial` is the
 * server-rendered value so the pill never flashes empty.
 */
export default function LivePulse({ initial, block = false }: { initial: Pulse; block?: boolean }) {
  const [p, setP] = useState<Pulse>(initial);
  const [armed, setArmed] = useState(false); // no pop on first paint, only on later changes

  useEffect(() => {
    let alive = true;
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/presence", { method: "POST", cache: "no-store", keepalive: true });
        if (res.ok && alive) setP((await res.json()) as Pulse);
      } catch {
        /* offline */
      }
    };
    void beat();
    const arm = setTimeout(() => setArmed(true), 1_000);
    const t = setInterval(() => void beat(), 30_000);
    const onVis = () => void beat();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearTimeout(arm);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const live = p.online > 0;
  const online = (
    <span className="inline-flex items-center gap-1.5">
      {/* beacon: solid dot + an expanding, fading ring (only while someone is here; static under reduced motion) */}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-up bb-beacon" : "bg-line-strong"}`} aria-hidden />
      {/* remount on change → one short scale pop, like the market caps in the list */}
      <span key={p.online} className={`font-mono tnum text-ink inline-block ${armed ? "bb-pop" : ""}`}>
        {p.online.toLocaleString("en-US")}
      </span>{" "}
      online
    </span>
  );

  if (block) {
    return (
      <div className="flex items-center justify-between min-h-12 px-3 rounded-xl text-base font-medium text-ink" title="cookie-free: all-time visits · people here right now">
        <span>
          <span className="font-mono tnum">{p.visits.toLocaleString("en-US")}</span> visits
        </span>
        <span className="text-sm text-muted">{online}</span>
      </div>
    );
  }
  return (
    <span
      className="hidden sm:inline-flex items-center gap-2 h-6 px-2.5 rounded-full border border-line bg-card text-[11px] font-medium text-muted whitespace-nowrap"
      title="cookie-free: all-time visits · people here right now"
    >
      <span>
        <span className="font-mono tnum text-ink">
          <span className="md:hidden">{compact(p.visits)}</span>
          <span className="hidden md:inline">{p.visits.toLocaleString("en-US")}</span>
        </span>{" "}
        visits
      </span>
      <span className="text-line-strong" aria-hidden>
        ·
      </span>
      {online}
    </span>
  );
}

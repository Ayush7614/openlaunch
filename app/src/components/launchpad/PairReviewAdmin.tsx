"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConfig } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { useHydratedAccount } from "@/lib/useHydratedAccount";
import { btn, card } from "@/components/ui";
import { CHAINS, explorerAddress, shortAddr } from "@/lib/chainPublic";
import { nowMs } from "@/lib/launchpad/time";
import { friendlyError } from "@/lib/errors";
import { nonce } from "@/lib/nonce";
import { buildPairReviewMessage, sourceLabel, type PairReviewDecision } from "@/lib/launchpad/pairApply";
import type { PairApplicationPublic } from "@/lib/launchpad/pairApplyServer";
import PrecheckReport from "./PrecheckReport";

/**
 * The community pair application queue for moderators: paid applications first, each with its check, its price
 * pool, the applicant and the community's proof post. Approve lists the pair (through the listing's own checks);
 * Changes and Reject each use one of the application's three reviews and need a reason the applicant sees.
 */
export default function PairReviewAdmin() {
  const { address } = useHydratedAccount();
  const config = useConfig();
  const [apps, setApps] = useState<PairApplicationPublic[] | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pairs/applications", { cache: "no-store" });
      if (res.ok) setApps(((await res.json()) as { applications: PairApplicationPublic[] }).applications);
    } catch {
      // keep the last queue
    }
  }, []);
  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  async function decide(id: number, decision: PairReviewDecision) {
    if (!address || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const reason = (reasons[id] ?? "").trim();
      const n = nonce();
      const ts = nowMs();
      const wallet = await getWalletClient(config, { chainId: CHAINS.base.id });
      const signature = await wallet.signMessage({ message: buildPairReviewMessage({ decision, id, wallet: address, nonce: n, ts, reason }) });
      const res = await fetch("/api/pairs/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, id, reason, wallet: address, nonce: n, ts, signature }) });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? `request failed (HTTP ${res.status})`);
      setMsg({ ok: true, text: `Application ${id}: ${decision}` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="pair-review-heading">
      <h2 id="pair-review-heading" className="text-lg font-semibold text-ink">Pair applications</h2>
      {apps?.length === 0 ? <p className={`${card} p-6 text-sm text-muted`}>No applications.</p> : null}
      {apps?.map((a) => (
        <div key={a.id} className={`${card} space-y-2 p-4 text-sm`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/pairs/apply/${a.id}`} className="font-semibold text-ink">{a.symbol} · {a.name}</Link>
            <span className="font-mono text-[11px] text-muted">{a.code} · {a.status} · paid ${a.paid_usd.toFixed(0)}/{a.fee_usd} · reviews {a.reviews_used}/{a.reviews_max}</span>
          </div>
          <p className="text-xs text-body">
            Token <a href={explorerAddress(a.chain, a.address)} target="_blank" rel="noopener noreferrer" className="underline">{shortAddr(a.address)}</a> · by <a href={`/u/${a.applicant}`} className="underline">{shortAddr(a.applicant)}</a> · price {sourceLabel({ price_kind: a.price_kind, price_pool: a.price_pool, price_quote: a.price_quote, price_hook: a.price_hook ?? "" })}
          </p>
          <p className="text-xs text-body">
            Proof: {a.proof_url ? <a href={a.proof_url} target="_blank" rel="noopener noreferrer" className="underline">{a.proof_url}</a> : <span className="text-warm-ink">none yet</span>}
            {a.x_handle ? <> · X <a href={`https://x.com/${a.x_handle}`} target="_blank" rel="noopener noreferrer" className="underline">@{a.x_handle}</a></> : null}
            {a.website ? <> · <a href={a.website} target="_blank" rel="noopener noreferrer" className="underline">{a.website}</a></> : null}
          </p>
          <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} className="text-xs text-muted underline">{open === a.id ? "Hide the check" : `The check (${a.precheck.checks.filter((c) => !c.hard && c.pass === false).length} flags)`}</button>
          {open === a.id ? <PrecheckReport p={a.precheck} /> : null}
          {a.reason ? <p className="text-xs text-muted">Last reason: {a.reason}</p> : null}
          {a.status === "open" || a.status === "changes" ? (
            <div className="flex flex-wrap gap-2">
              <input aria-label={`Reason for closing ${a.symbol}`} value={reasons[a.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [a.id]: e.target.value }))} placeholder="Reason for closing (the applicant sees it)" maxLength={300} className="min-h-9 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-xs text-ink" />
              <button type="button" disabled={!address || busy || !(reasons[a.id] ?? "").trim()} onClick={() => void decide(a.id, "reject")} className={`${btn.secondarySm} text-down-ink`}>Close</button>
            </div>
          ) : null}
          {a.status === "paid" ? (
            <div className="flex flex-wrap gap-2">
              <input aria-label={`Reason for ${a.symbol}`} value={reasons[a.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [a.id]: e.target.value }))} placeholder="Reason (the applicant sees it)" maxLength={300} className="min-h-9 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-xs text-ink" />
              <button type="button" disabled={!address || busy} onClick={() => void decide(a.id, "approve")} className={btn.primarySm}>Approve</button>
              <button type="button" disabled={!address || busy || !(reasons[a.id] ?? "").trim()} onClick={() => void decide(a.id, "changes")} className={btn.secondarySm}>Changes</button>
              <button type="button" disabled={!address || busy || !(reasons[a.id] ?? "").trim()} onClick={() => void decide(a.id, "reject")} className={`${btn.secondarySm} text-down-ink`}>Reject</button>
            </div>
          ) : null}
        </div>
      ))}
      {msg ? <p role="status" className={`text-xs ${msg.ok ? "text-up" : "text-down-ink"}`}>{msg.text}</p> : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useConfig, useConnect } from "wagmi";
import { getPublicClient, getWalletClient } from "wagmi/actions";
import type { Address } from "viem";
import TokenAvatar from "./TokenAvatar";
import ChainBadge from "./ChainBadge";
import FeeChip, { feeModeOf } from "./FeeChip";
import EditTokenSheet from "./EditTokenSheet";
import { toast } from "./TxToasts";
import { btn, card } from "@/components/ui";
import { LAUNCH_LOCKER_ABI, ERC20_MIN_ABI } from "@/lib/launchpad/abi";
import { launchpad, quoteInfo } from "@/lib/launchpad/config";
import { earnedRaw, feeShareBps, holdingUsd, isBurnOnly } from "@/lib/launchpad/creator";
import { fmtCompact, fmtQuote, fmtUsd } from "@/lib/launchpad/math";
import type { LaunchRow, WalletTrade } from "@/lib/launchpad/queries";
import type { EditFields } from "@/lib/launchpad/editAuth";
import { ago } from "@/lib/launchpad/time";
import { BUILDER_DATA_SUFFIX, CHAINS, CHAIN_SHORT, explorerTx, shortAddr, type ChainKey } from "@/lib/chainPublic";
import { friendlyError } from "@/lib/errors";
import { SkRow, SkStat } from "@/components/Skeleton";

type Me = { wallet: string; ethUsd: number | null; launches: LaunchRow[]; tokens: (LaunchRow & { my_buys: number; my_sells: number; my_last_trade: string })[]; trades: WalletTrade[] };
type Pending = Record<string, bigint | null>; // key chain:token → uncollected quote (raw), null = unknown
type Balances = Record<string, bigint>;

const key = (l: { chain: ChainKey; token: string }) => `${l.chain}:${l.token}`;

/**
 * Creator dashboard. Everything shown is public on-chain data for the connected
 * address; the only writes are transactions the wallet signs (collect / claim)
 * and creator-signed metadata edits. No server keys, no sessions.
 */
export default function MeDashboard() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const config = useConfig();
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>({});
  const [balances, setBalances] = useState<Balances>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<LaunchRow | null>(null);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/me?wallet=${address}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`me ${res.status}`);
      const m = (await res.json()) as Me;
      setMe(m);
      setErr(null);
      setNow(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed to load");
    }
  }, [address]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  // uncollected fees: simulate collect() per launch (eth_call, no gas) — and token balances for holdings
  useEffect(() => {
    if (!me || !address) return;
    let alive = true;
    const run = async () => {
      const p: Pending = {};
      await Promise.all(
        me.launches.map(async (l) => {
          const cfg = launchpad(l.chain);
          if (!cfg.locker || l.lp_fee === 0) {
            p[key(l)] = 0n;
            return;
          }
          try {
            const pub = getPublicClient(config, { chainId: CHAINS[l.chain].id })!;
            const { result } = await pub.simulateContract({ address: cfg.locker, abi: LAUNCH_LOCKER_ABI, functionName: "collect", args: [BigInt(l.token_id)], account: address });
            p[key(l)] = result[0];
          } catch {
            p[key(l)] = null;
          }
        }),
      );
      const b: Balances = {};
      await Promise.all(
        me.tokens.map(async (t) => {
          try {
            const pub = getPublicClient(config, { chainId: CHAINS[t.chain].id })!;
            b[key(t)] = await pub.readContract({ address: t.token as Address, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [address] });
          } catch {
            /* leave unknown */
          }
        }),
      );
      if (alive) {
        setPending(p);
        setBalances(b);
      }
    };
    const id = setTimeout(() => void run(), 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [me, address, config]);

  async function collect(l: LaunchRow) {
    const cfg = launchpad(l.chain);
    if (!cfg.locker || !address) return;
    setBusy(key(l));
    try {
      const pub = getPublicClient(config, { chainId: CHAINS[l.chain].id })!;
      const wallet = await getWalletClient(config, { chainId: CHAINS[l.chain].id });
      const { request } = await pub.simulateContract({ address: cfg.locker, abi: LAUNCH_LOCKER_ABI, functionName: "collect", args: [BigInt(l.token_id)], account: address, dataSuffix: BUILDER_DATA_SUFFIX });
      const hash = await wallet.writeContract(request);
      await pub.waitForTransactionReceipt({ hash });
      await fetch(`/api/launch/sync?chain=${l.chain}&tx=${hash}`, { method: "POST" }).catch(() => {});
      toast({ kind: "collect", title: `Fees collected for ${l.symbol}`, sub: isBurnOnly(l.recipients) ? "Burned on the spot" : "Paid to the beneficiaries", chain: l.chain, token: l.token, symbol: l.symbol });
      await load();
    } catch (e) {
      toast({ kind: "info", title: `Collect failed for ${l.symbol}`, sub: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  async function collectAll() {
    if (!me) return;
    for (const l of me.launches) {
      const p = pending[key(l)];
      if (p && p > 0n) await collect(l);
    }
  }

  if (!isConnected || !address) {
    const c = connectors.find((x) => x.id === "coinbaseWallet") ?? connectors[0];
    return (
      <div className={`${card} p-10 text-center space-y-4`}>
        <p className="text-base text-body">Connect a wallet to see your launches, fees, holdings and trades — on both chains.</p>
        <button type="button" onClick={() => c && connect({ connector: c })} disabled={connecting || !c} className={btn.primary}>
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
        <p className="text-xs text-muted">Read-only until you sign something. Nothing here is stored about you.</p>
      </div>
    );
  }

  const collectable = me ? me.launches.filter((l) => (pending[key(l)] ?? 0n) > 0n) : [];
  const earnedUsd = me ? me.launches.reduce((a, l) => a + (l.quote_usd === null ? 0 : (Number(earnedRaw(l.fees_quote_collected, l.fees_quote_burned, feeShareBps(l.recipients, address))) / 10 ** l.quote_decimals) * l.quote_usd), 0) : 0;
  const holdingsUsd = me ? me.tokens.reduce((a, t) => a + (holdingUsd(balances[key(t)] ?? 0n, t.price_quote, t.quote_usd) ?? 0), 0) : 0;

  if (!me) {
    return (
      <div className="space-y-8" aria-busy="true" aria-label="loading your dashboard">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }, (_, k) => (
            <SkStat key={k} />
          ))}
        </dl>
        <ul className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
          {Array.from({ length: 3 }, (_, k) => (
            <SkRow key={k} i={k} />
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {err ? <p className="rounded-xl bg-down-soft border border-down/20 text-down-ink text-sm px-3 py-2">{err}</p> : null}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat k="Launches" v={me ? String(me.launches.length) : "…"} />
        <Stat k="Fees earned" v={me ? fmtUsd(earnedUsd, { compact: true }) : "…"} accent="up" />
        <Stat k="Uncollected" v={collectable.length ? `${collectable.length} pool${collectable.length === 1 ? "" : "s"}` : "0"} accent={collectable.length ? "warm" : undefined} />
        <Stat k="Holdings" v={me ? fmtUsd(holdingsUsd, { compact: true }) : "…"} />
      </dl>

      {/* launches */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-ink">Your launches</h2>
          {collectable.length > 1 ? (
            <button type="button" onClick={() => void collectAll()} disabled={busy !== null} className={btn.primarySm}>
              {busy ? "Collecting…" : `Collect all (${collectable.length})`}
            </button>
          ) : null}
        </div>
        {me && me.launches.length === 0 ? (
          <div className={`${card} p-8 text-center space-y-3`}>
            <p className="text-sm text-muted">No launches from this wallet yet.</p>
            <Link href="/launch" className={btn.primarySm}>Launch a token</Link>
          </div>
        ) : null}
        <ul className="space-y-2">
          {me?.launches.map((l) => {
            const q = quoteInfo(l.chain, l.quote);
            const share = feeShareBps(l.recipients, address);
            const earned = earnedRaw(l.fees_quote_collected, l.fees_quote_burned, share);
            const p = pending[key(l)];
            const k = key(l);
            return (
              <li key={k} className={`${card} px-4 py-3`}>
                <div className="flex items-center gap-3 min-w-0 flex-wrap">
                  <Link href={`/t/${l.chain}/${l.token}`} className="flex items-center gap-3 min-w-0 flex-1">
                    <TokenAvatar token={l.token} symbol={l.symbol} image={l.image_url} size={40} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[15px] text-ink truncate">{l.name}</span>
                        <span className="font-mono text-xs text-muted">{l.symbol}</span>
                        <ChainBadge chain={l.chain} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted font-mono">
                        <FeeChip lpFee={l.lp_fee} mode={feeModeOf(l.lp_fee, l.recipients)} />
                        <span>mc {l.fdv_usd !== null ? fmtUsd(l.fdv_usd, { compact: true }) : "—"}</span>
                        <span>· {l.buys + l.sells} trades</span>
                        {now ? <span suppressHydrationWarning>· {ago(l.block_time, now)} ago</span> : null}
                      </div>
                    </div>
                  </Link>
                  <div className="text-right font-mono tnum text-sm">
                    <div className="text-up font-bold">{l.quote_usd !== null ? fmtUsd((Number(earned) / 10 ** l.quote_decimals) * l.quote_usd) : fmtQuote(earned, q.decimals, q.symbol)}</div>
                    <div className="text-[11px] text-muted">earned · {share / 100}% share</div>
                  </div>
                  <div className="text-right font-mono tnum text-sm min-w-[7rem]">
                    <div className={p && p > 0n ? "text-warm-ink font-bold" : "text-muted"}>{p === undefined ? "…" : p === null ? "—" : fmtQuote(p, q.decimals, q.symbol)}</div>
                    <div className="text-[11px] text-muted">uncollected</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => void collect(l)} disabled={busy !== null || !p || p === 0n} className={btn.secondarySm}>
                      {busy === k ? "…" : "Collect"}
                    </button>
                    <button type="button" onClick={() => setEditing(l)} className={btn.softSm}>
                      Edit
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* holdings */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Your holdings</h2>
        {me && me.tokens.length === 0 ? <p className={`${card} p-6 text-sm text-muted text-center`}>No tokens traded from this wallet yet.</p> : null}
        <ul className="space-y-2">
          {me?.tokens.map((t) => {
            const bal = balances[key(t)];
            const usd = bal === undefined ? null : holdingUsd(bal, t.price_quote, t.quote_usd);
            return (
              <li key={key(t)} className={`${card} px-4 py-3`}>
                <Link href={`/t/${t.chain}/${t.token}`} className="flex items-center gap-3 min-w-0">
                  <TokenAvatar token={t.token} symbol={t.symbol} image={t.image_url} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink truncate">{t.name}</span>
                      <span className="font-mono text-xs text-muted">{t.symbol}</span>
                      <ChainBadge chain={t.chain} />
                    </div>
                    <div className="text-[11px] text-muted font-mono">
                      {t.my_buys} buys · {t.my_sells} sells · mc {t.fdv_usd !== null ? fmtUsd(t.fdv_usd, { compact: true }) : "—"}
                    </div>
                  </div>
                  <div className="text-right font-mono tnum text-sm">
                    <div className="text-ink font-bold">{bal === undefined ? "…" : fmtCompact(Number(bal) / 1e18)}</div>
                    <div className="text-[11px] text-muted">{usd === null ? "" : fmtUsd(usd)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* trades */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Your trades</h2>
        {me && me.trades.length === 0 ? <p className={`${card} p-6 text-sm text-muted text-center`}>No trades yet.</p> : null}
        {me && me.trades.length > 0 ? (
          <div className={`${card} overflow-x-auto bb-scroll`}>
            <table className="w-full text-sm">
              <tbody className="font-mono tnum">
                {me.trades.map((t) => (
                  <tr key={t.tx_hash} className="border-b border-line last:border-0">
                    <td className="px-4 py-2"><span className={`font-sans font-semibold ${t.is_buy ? "text-up" : "text-down-ink"}`}>{t.is_buy ? "Buy" : "Sell"}</span></td>
                    <td className="px-4 py-2 text-ink"><Link href={`/t/${t.chain}/${t.token}`} className="hover:underline">{t.symbol}</Link> <span className="text-[10px] text-muted">{CHAIN_SHORT[t.chain]}</span></td>
                    <td className="px-4 py-2 text-right text-ink">{fmtQuote(t.quote_raw, t.quote_decimals, t.quote_symbol)}</td>
                    <td className="px-4 py-2 text-right text-muted hidden sm:table-cell">{t.usd !== null ? fmtUsd(t.usd) : ""}</td>
                    <td className="px-4 py-2 text-right text-muted">
                      <a href={explorerTx(t.chain, t.tx_hash)} target="_blank" rel="noreferrer" className="hover:text-ink" suppressHydrationWarning>{now ? ago(t.block_time, now) : ""}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <p className="text-[11px] text-muted">Wallet {shortAddr(address)}. Everything above is public on-chain data; nothing is stored about you.</p>

      {editing ? (
        <EditTokenSheet
          chain={editing.chain}
          token={editing.token}
          symbol={editing.symbol}
          initial={{ description: editing.description ?? "", image_url: editing.image_url ?? "", website: editing.website ?? "", x_handle: editing.x_handle ?? "" }}
          onClose={() => setEditing(null)}
          onSaved={(f: EditFields) => {
            setMe((m) => (m ? { ...m, launches: m.launches.map((l) => (key(l) === key(editing) ? { ...l, description: f.description || null, image_url: f.image_url || null, website: f.website || null, x_handle: f.x_handle || null } : l)) } : m));
            toast({ kind: "info", title: `${editing.symbol} details updated` });
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: "up" | "warm" }) {
  return (
    <div className="rounded-xl bg-card border border-line shadow-card px-3.5 py-3 min-w-0">
      <dt className="text-xs text-muted truncate">{k}</dt>
      <dd className={`mt-0.5 font-mono font-bold text-lg tnum truncate ${accent === "up" ? "text-up" : accent === "warm" ? "text-warm-ink" : "text-ink"}`}>{v}</dd>
    </div>
  );
}

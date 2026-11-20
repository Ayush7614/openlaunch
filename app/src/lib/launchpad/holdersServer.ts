import "server-only";
import { maybeDb, type Db } from "@/lib/db";
import { chainIdOf, type ChainKey } from "@/lib/chainPublic";
import { DEAD_ADDR, TOP_HOLDERS, ZERO_ADDR, creatorActivity, holderTags, shareBps, sniperSummary, trustNotes, type HolderTag } from "./holders";
import { systemAddresses } from "./indexer";

export type HolderRow = { address: string; balance: string; bps: number; tags: HolderTag[] };

/** The holder facts on their own: distribution and supply, without the trust panel's creator and sniper work. */
export type HolderSummary = {
  synced: boolean; // false while the token's transfer history is still being backfilled
  holders: number;
  supply: string;
  top: { address: string; balance: string; bps: number }[];
  top10Bps: number;
  poolBps: number;
};

export type HolderPanel = Omit<HolderSummary, "top"> & {
  top: HolderRow[];
  creator: { address: string; bps: number; bought: string; sold: string; sells: number };
  sniper: { wallets: number; bps: number };
  notes: { level: "warn" | "info" | "good"; text: string }[];
};

/** Whether a launch's transfer history is complete: the indexer writes the SYNCED_FOREVER sentinel far past its launch block. */
function historyComplete(holdersSyncedBlock: bigint | null, launchBlock: bigint): boolean {
  return holdersSyncedBlock !== null && BigInt(holdersSyncedBlock) > BigInt(launchBlock) + 1_000_000n;
}

/**
 * The two reads both readers need, issued together: the largest holder balances (the protocol's own addresses and the
 * pool aside) and the balance the pool holds. A caller adds its own reads to the same Promise.all, so they run alongside.
 */
function holderReads(db: Db, cid: number, t: string, system: string[]) {
  const excluded = [...system, ZERO_ADDR, DEAD_ADDR];
  return Promise.all([
    db<{ holder: string; balance: string }[]>`
      SELECT h.holder, h.balance::text AS balance FROM bb_token_holders h
       WHERE h.chain_id = ${cid} AND h.token = ${t} AND h.balance > 0 AND NOT (h.holder = ANY(${excluded}))
       ORDER BY h.balance DESC LIMIT ${TOP_HOLDERS}`, // qualified: a bare "balance" would sort the ::text alias
    db<{ balance: string }[]>`
      SELECT COALESCE(sum(balance), 0)::text AS balance FROM bb_token_holders WHERE chain_id = ${cid} AND token = ${t} AND holder = ANY(${system})`,
  ]);
}

/**
 * HolderSummary for one launch: the two indexed reads the distribution needs, and not the launch's swaps, which only the
 * panel's sniper and creator work below uses. A caller that shows holders alone (the details page and
 * /api/launch/metrics) pays for the figures it asks for, however many trades the launch has.
 */
export async function getHolderSummary(chain: ChainKey, token: string): Promise<HolderSummary | null> {
  const db = maybeDb();
  if (!db) return null;
  const cid = chainIdOf(chain);
  const t = token.toLowerCase();
  const [l] = await db<{ supply: string; block_number: bigint; holders: number; holders_synced_block: bigint | null }[]>`
    SELECT supply::text AS supply, block_number, holders, holders_synced_block FROM bb_launches WHERE chain_id = ${cid} AND token = ${t}`;
  if (!l) return null;
  const supply = BigInt(l.supply);
  const [rows, pool] = await holderReads(db, cid, t, systemAddresses(chain));
  const top = rows.map((r) => ({ address: r.holder, balance: r.balance, bps: shareBps(BigInt(r.balance), supply) }));
  return {
    synced: historyComplete(l.holders_synced_block, l.block_number),
    holders: l.holders,
    supply: l.supply,
    top,
    top10Bps: top.reduce((a, r) => a + r.bps, 0),
    poolBps: shareBps(BigInt(pool[0]?.balance ?? "0"), supply),
  };
}

/** Holder distribution + creator / sniper facts for one launch. Cheap: two indexed queries + one small scan of its swaps. */
export async function getHolderPanel(chain: ChainKey, token: string): Promise<HolderPanel | null> {
  const db = maybeDb();
  if (!db) return null;
  const cid = chainIdOf(chain);
  const t = token.toLowerCase();
  const [l] = await db<{ launcher: string; supply: string; block_number: bigint; holders: number; holders_synced_block: bigint | null }[]>`
    SELECT launcher, supply::text AS supply, block_number, holders, holders_synced_block FROM bb_launches WHERE chain_id = ${cid} AND token = ${t}`;
  if (!l) return null;
  const supply = BigInt(l.supply);
  const system = systemAddresses(chain);
  const [[rows, pool], swaps] = await Promise.all([
    holderReads(db, cid, t, system),
    db<{ trader: string | null; is_buy: boolean; block_number: bigint; amount1: string }[]>`
      SELECT trader, is_buy, block_number, amount1::text AS amount1 FROM bb_launch_swaps WHERE chain_id = ${cid} AND token = ${t}`,
  ]);
  const lite = swaps.map((s) => ({ trader: s.trader, is_buy: s.is_buy, block_number: s.block_number, token_amount: BigInt(s.amount1) }));
  const sn = sniperSummary(lite, l.block_number, supply);
  const creator = creatorActivity(lite, l.launcher);
  const ctx = { launcher: l.launcher, system, snipers: new Set(sn.wallets) };
  const top = rows.map((r) => ({ address: r.holder, balance: r.balance, bps: shareBps(BigInt(r.balance), supply), tags: holderTags(r.holder, BigInt(r.balance), supply, ctx) }));
  const [creatorRow] = await db<{ balance: string }[]>`SELECT balance::text AS balance FROM bb_token_holders WHERE chain_id = ${cid} AND token = ${t} AND holder = ${l.launcher.toLowerCase()}`;
  const creatorBps = shareBps(BigInt(creatorRow?.balance ?? "0"), supply);
  const top10Bps = top.reduce((a, r) => a + r.bps, 0);
  const poolBps = shareBps(BigInt(pool[0]?.balance ?? "0"), supply);
  const synced = historyComplete(l.holders_synced_block, l.block_number);
  return {
    synced,
    holders: l.holders,
    supply: l.supply,
    top,
    top10Bps,
    poolBps,
    creator: { address: l.launcher, bps: creatorBps, bought: creator.bought.toString(), sold: creator.sold.toString(), sells: creator.sells },
    sniper: { wallets: sn.wallets.length, bps: sn.boughtBps },
    notes: trustNotes({ holders: l.holders, creatorBps, creatorSells: creator.sells, sniperBps: sn.boughtBps, sniperWallets: sn.wallets.length, top10Bps, poolBps }),
  };
}

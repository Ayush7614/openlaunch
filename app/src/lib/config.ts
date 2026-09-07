import "server-only";

/** Server-only env knobs. Everything degrades to "feature off" when unset. */
function intEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : fallback;
}

// ── indexer ──────────────────────────────────────────────────────────────────
export const SYNC_CHUNK_BLOCKS = 2000n;
export const SYNC_MAX_CHUNKS_PER_CALL = 12;
/** Poller overlap: every run re-scans this many blocks behind the cursor (default 50). */
export function syncOverlapBlocks(): bigint {
  return BigInt(intEnv("SYNC_OVERLAP_BLOCKS", 50));
}
/** /api/health reports an alert when head − cursor exceeds this (default 200 ≈ 400s on Base). */
export function syncLagAlertBlocks(): number {
  return intEnv("SYNC_LAG_ALERT_BLOCKS", 200);
}

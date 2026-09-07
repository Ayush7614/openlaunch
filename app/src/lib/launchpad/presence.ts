import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { maybeDb } from "@/lib/db";
import { memo } from "./memo";

/**
 * Site pulse: all-time visits + people online right now. Cookie-free.
 * A visitor is sha256(ip | user-agent | daily salt) — rotates every UTC day and
 * cannot be reversed. "Online" = a beacon in the last ONLINE_WINDOW_S seconds;
 * a "visit" is counted when a visitor is seen after VISIT_GAP_S of silence.
 */
export const ONLINE_WINDOW_S = 90;
export const VISIT_GAP_S = 30 * 60;

const processSalt = randomBytes(16).toString("hex");
function dailySalt(): string {
  return `${process.env.PRESENCE_SALT?.trim() || processSalt}:${new Date().toISOString().slice(0, 10)}`;
}

export function visitorHash(ip: string, ua: string): string {
  return createHash("sha256").update(`${ip}|${ua}|${dailySalt()}`).digest("hex");
}

export function looksLikeBot(ua: string): boolean {
  return /bot|crawl|spider|slurp|headless|preview|fetch|curl|wget|python|node-fetch|axios|monitor|uptime|lighthouse/i.test(ua);
}

export type Pulse = { visits: number; online: number };

export async function readPulse(): Promise<Pulse> {
  const db = maybeDb();
  if (!db) return { visits: 0, online: 0 };
  const [r] = await db<{ visits: bigint | null; online: bigint }[]>`
    SELECT (SELECT visits FROM bb_site_counters WHERE id = 1) AS visits,
           (SELECT count(*) FROM bb_presence WHERE last_seen > now() - make_interval(secs => ${ONLINE_WINDOW_S})) AS online`;
  return { visits: Number(r?.visits ?? 0), online: Number(r?.online ?? 0) };
}

/** Record a beacon; returns the fresh pulse. Counts a visit on first sight or after VISIT_GAP_S idle. */
export async function recordBeacon(hash: string): Promise<Pulse> {
  const db = maybeDb();
  if (!db) return { visits: 0, online: 0 };
  await db`
    WITH prev AS (SELECT last_seen FROM bb_presence WHERE visitor_hash = ${hash}),
         up AS (
           INSERT INTO bb_presence (visitor_hash) VALUES (${hash})
           ON CONFLICT (visitor_hash) DO UPDATE SET last_seen = now()
           RETURNING 1
         )
    UPDATE bb_site_counters SET visits = visits + 1
     WHERE id = 1
       AND (NOT EXISTS (SELECT 1 FROM prev) OR (SELECT last_seen FROM prev) < now() - make_interval(secs => ${VISIT_GAP_S}))
       AND EXISTS (SELECT 1 FROM up)`;
  return memo("pulse", 2_000, () => readPulse());
}

/** Housekeeping: forget visitors idle for a day (called opportunistically by the beacon route). */
export async function prunePresence(): Promise<void> {
  const db = maybeDb();
  if (!db) return;
  await db`DELETE FROM bb_presence WHERE last_seen < now() - interval '1 day'`;
}

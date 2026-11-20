import "server-only";
import { chainIdOf, type ChainKey } from "@/lib/chainPublic";
import { maybeDb } from "@/lib/db";
import { ethUsd } from "./ethPrice";
import { getHolderPanel } from "./holdersServer";
import { memo } from "./memo";
import { launchMetrics, type LaunchMetrics } from "./metrics";
import { getLaunch } from "./queries";

export type { LaunchMetrics };

/**
 * One launch's detail figures, or null when there is no such launch. Memoized for 30 seconds per launch, so the page
 * and /api/launch/metrics read the database once however often a reader reloads or opens a second tab.
 */
export function getLaunchMetrics(chain: ChainKey, token: string): Promise<LaunchMetrics | null> {
  const t = token.toLowerCase();
  return memo(`metrics:${chain}:${t}`, 30_000, () => read(chain, t));
}

async function read(chain: ChainKey, token: string): Promise<LaunchMetrics | null> {
  const db = maybeDb();
  if (!db) return null;
  const usd = await ethUsd();
  const [launch, panel, feeRows] = await Promise.all([
    // the launch read model: quote decimals as the server resolved them and volume in USD at each trade's own hour
    getLaunch(chain, token, usd),
    getHolderPanel(chain, token),
    // the launch's own fee totals, already in USD: the indexer stores each fee event's value in its own hour's price
    db<{ collected: number; burned: number }[]>`
      SELECT fees_collected_usd::float8 AS collected, fees_burned_usd::float8 AS burned
        FROM bb_launches WHERE chain_id = ${chainIdOf(chain)} AND token = ${token}`,
  ]);
  if (!launch || !panel) return null;
  const fees = feeRows[0] ?? { collected: 0, burned: 0 };
  return launchMetrics(launch, panel, { collected_usd: fees.collected, burned_usd: fees.burned });
}

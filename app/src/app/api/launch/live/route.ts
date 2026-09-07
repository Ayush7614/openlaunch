import { NextResponse } from "next/server";
import { isChainKey } from "@/lib/chainPublic";
import { isFilter } from "@/lib/launchpad/search";
import { clampLimit } from "@/lib/launchpad/paging";
import { LAUNCH_SORTS, VOLUME_WINDOWS, getLaunchFeed, getLaunchTotals, getTrending, listLaunchesPage, type LaunchSort, type VolumeWindow } from "@/lib/launchpad/queries";
import { ethUsd } from "@/lib/launchpad/ethPrice";
import { memo } from "@/lib/launchpad/memo";
import { listFeed } from "@/lib/launchpad/postsServer";

export const dynamic = "force-dynamic";

/** One request for everything live on a page (feed, totals, optional list). Polled every ~5s by LiveProvider. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const sortRaw = u.searchParams.get("sort");
  const sort = sortRaw && LAUNCH_SORTS.includes(sortRaw as LaunchSort) ? (sortRaw as LaunchSort) : null;
  const winRaw = u.searchParams.get("window");
  const window = winRaw && VOLUME_WINDOWS.includes(winRaw as VolumeWindow) ? (winRaw as VolumeWindow) : "all";
  const c = u.searchParams.get("chain");
  const chain = isChainKey(c) ? c : null;
  const f = u.searchParams.get("filter");
  const filter = isFilter(f) ? f : null;
  const limit = clampLimit(u.searchParams.get("limit"), 40);
  const usd = await ethUsd();
  const [feed, totals, page, posts, trending] = await Promise.all([
    memo("feed", 2_000, () => getLaunchFeed(24, usd)),
    memo("totals", 2_000, () => getLaunchTotals(usd)),
    sort ? memo(`list:${chain ?? "all"}:${sort}:${window}:${filter ?? "-"}:${limit}`, 2_000, () => listLaunchesPage({ sort, window, chain, filter, limit, offset: 0, ethUsd: usd })) : Promise.resolve(null),
    memo("feed-posts:0", 2_000, () => listFeed(30, 0)),
    memo("trending", 2_000, () => getTrending(usd)),
  ]);
  return NextResponse.json({ at: Date.now(), feed, totals, ethUsd: usd, sort, window, chain, filter, limit, has_more: page?.hasMore ?? null, launches: page?.items ?? null, posts, trending }, { headers: { "cache-control": "no-store" } });
}

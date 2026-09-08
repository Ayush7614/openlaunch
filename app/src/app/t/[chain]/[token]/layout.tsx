import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { isChainKey } from "@/lib/chainPublic";
import { getLaunch } from "@/lib/launchpad/queries";
import { memo } from "@/lib/launchpad/memo";

export const dynamic = "force-dynamic";

/**
 * Existence gate for the token route. The page sits under a loading boundary, so by the time it
 * calls notFound() the streamed shell has already gone out with a 200. A layout renders before that
 * boundary, so a miss here is a real HTTP 404 (search engines drop the URL; the site 404 page shows).
 */
export default async function TokenLayout({ params, children }: { params: Promise<{ chain: string; token: string }>; children: React.ReactNode }) {
  const { chain, token } = await params;
  if (!isChainKey(chain) || !isAddress(token)) notFound();
  const exists = await memo(`launch-exists:${chain}:${token.toLowerCase()}`, 3_000, async () => Boolean(await getLaunch(chain, token)));
  if (!exists) notFound();
  return children;
}

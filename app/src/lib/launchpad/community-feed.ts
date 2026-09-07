/** Presentation-only search over the recent posts already loaded by the feed. */
type FeedSearchRow = { chain: string; body: string; token: string; wallet: string; symbol?: string; name?: string };
export function filterCommunityPosts<T extends FeedSearchRow>(posts: T[], chain: string | null, query: string): T[] {
  const q = query.trim().toLowerCase();
  return posts.filter((p) => (!chain || p.chain === chain) && (!q || [p.body, p.symbol, p.name, p.token, p.wallet].some((value) => value?.toLowerCase().includes(q))));
}

/** Shared live snapshots contain 30 posts; compare that window without losing the server's full feed. */
export function communityFingerprint(posts: { id: number; body: string; tag: string | null; created_at: string }[]): string {
  return JSON.stringify(posts.slice(0, 30).map(({ id, body, tag, created_at }) => [id, body, tag, created_at]));
}

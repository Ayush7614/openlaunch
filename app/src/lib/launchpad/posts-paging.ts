/**
 * Cursor pagination for token comments (pure; unit-tested).
 *
 * GET /api/posts?chain=&token= returned every visible post on the token in
 * one unbounded fetch (server capped at LIMIT 300, no cursor). A viral token
 * pays the full scan on every poll. This owns the query parsing so the route
 * and postsServer share one definition: `limit` (1–100, default 50) and
 * `before` (exclusive id cursor, newest page first).
 */

export const TOKEN_POSTS_DEFAULT_LIMIT = 50;
export const TOKEN_POSTS_MAX_LIMIT = 100;

export function parseTokenPostsPaging(query: { limit?: unknown; before?: unknown }): { limit: number; beforeId: number | null } {
  const rawLimit = Number(query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(TOKEN_POSTS_MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)))
    : TOKEN_POSTS_DEFAULT_LIMIT;
  const rawBefore = query.before === null || query.before === undefined || query.before === "" ? NaN : Number(query.before);
  const beforeId = Number.isInteger(rawBefore) && rawBefore > 0 ? rawBefore : null;
  return { limit, beforeId };
}

export function postsCursorKey(chain: string, token: string, limit: number, beforeId: number | null): string {
  return `posts:${chain}:${token.toLowerCase()}:${limit}:${beforeId ?? "head"}`;
}

/** Cursor for the next page: oldest id on a full page, else null (no more). */
export function nextPostsCursor(ids: number[], limit: number): number | null {
  if (ids.length < limit) return null;
  const oldest = ids[ids.length - 1];
  return Number.isInteger(oldest) && oldest > 0 ? oldest : null;
}

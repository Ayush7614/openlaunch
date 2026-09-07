import "server-only";

/**
 * Tiny in-process memo for hot read endpoints. With N browsers polling every
 * 5s, a 2s TTL turns N queries into ~1 per key without anyone noticing.
 * In-flight requests for the same key share one promise (no thundering herd).
 */
const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn().catch((err) => {
    store.delete(key);
    throw err;
  });
  store.set(key, { at: now, value });
  if (store.size > 200) for (const [k, v] of store) if (now - v.at > ttlMs) store.delete(k);
  return value;
}

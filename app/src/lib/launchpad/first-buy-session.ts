/**
 * "No first buy" for this tab session, as an external store so the launch form can read it with useSyncExternalStore:
 * the server snapshot is always false, so server and client render the same markup during hydration, and the client
 * re-renders with the real flag right after. (A lazy useState read of sessionStorage rendered the suggestion on the
 * server and the cleared state on the client: a hydration mismatch. An effect that sets state is rejected by the lint
 * rules.) Only the explicit "No first buy" button writes the flag; clearing the field or a chip is in-memory only.
 */

export const FIRST_BUY_DECLINED_KEY = "ol:first-buy-declined";

const listeners = new Set<() => void>();

export function subscribeFirstBuyDeclined(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Client snapshot: the flag, or false when storage is blocked or absent. */
export function getFirstBuyDeclined(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(FIRST_BUY_DECLINED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Server snapshot: never declined, so the first client render matches the server's. */
export function getFirstBuyDeclinedServer(): boolean {
  return false;
}

export function setFirstBuyDeclined(declined: boolean): void {
  try {
    if (declined) sessionStorage.setItem(FIRST_BUY_DECLINED_KEY, "1");
    else sessionStorage.removeItem(FIRST_BUY_DECLINED_KEY);
  } catch {
    /* storage blocked: the in-memory state still applies for this render */
  }
  for (const cb of listeners) cb();
}

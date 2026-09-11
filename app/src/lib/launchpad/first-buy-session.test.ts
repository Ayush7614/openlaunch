import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_BUY_DECLINED_KEY, getFirstBuyDeclined, getFirstBuyDeclinedServer, setFirstBuyDeclined, subscribeFirstBuyDeclined } from "./first-buy-session.ts";

function fakeStorage(): Storage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)), removeItem: (k) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage & { store: Map<string, string> };
}

test("server snapshot is always false; client snapshot follows the flag; writes notify subscribers", () => {
  const g = globalThis as { sessionStorage?: Storage };
  const prev = g.sessionStorage;
  g.sessionStorage = fakeStorage();
  try {
    assert.equal(getFirstBuyDeclinedServer(), false);
    assert.equal(getFirstBuyDeclined(), false, "cold tab");
    let notified = 0;
    const off = subscribeFirstBuyDeclined(() => { notified += 1; });
    setFirstBuyDeclined(true);
    assert.equal(getFirstBuyDeclined(), true);
    assert.equal((g.sessionStorage as ReturnType<typeof fakeStorage>).store.get(FIRST_BUY_DECLINED_KEY), "1");
    setFirstBuyDeclined(false);
    assert.equal(getFirstBuyDeclined(), false);
    assert.equal(notified, 2);
    off();
    setFirstBuyDeclined(true);
    assert.equal(notified, 2, "unsubscribed");
    assert.equal(getFirstBuyDeclinedServer(), false, "the server never sees the flag, whatever the tab holds: that is the hydration guarantee");
  } finally {
    if (prev === undefined) delete g.sessionStorage; else g.sessionStorage = prev;
  }
});

test("storage blocked or absent: reads are false and writes do not throw", () => {
  const g = globalThis as { sessionStorage?: Storage };
  const prev = g.sessionStorage;
  delete g.sessionStorage;
  try {
    assert.equal(getFirstBuyDeclined(), false);
    assert.doesNotThrow(() => setFirstBuyDeclined(true));
    Object.defineProperty(g, "sessionStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.equal(getFirstBuyDeclined(), false);
    assert.doesNotThrow(() => setFirstBuyDeclined(false));
  } finally {
    delete g.sessionStorage;
    if (prev !== undefined) g.sessionStorage = prev;
  }
});

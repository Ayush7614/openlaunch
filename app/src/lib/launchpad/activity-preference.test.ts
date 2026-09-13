import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Preference = typeof import("./activity-preference");
type StorageEventLike = { key: string | null; newValue: string | null; storageArea: unknown };
const source = readFileSync(new URL("./activity-preference.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

/** Each VM is a fresh page/module; the map represents persisted browser storage. */
function page(values = new Map<string, string>(), server = false) {
  let blockedRead = false;
  let blockedWrite = false;
  const events = new Set<(event: StorageEventLike) => void>();
  const hooks: unknown[][] = [];
  const storage = {
    getItem(key: string) { if (blockedRead) throw new Error("Storage denied"); return values.get(key) ?? null; },
    setItem(key: string, value: string) { if (blockedWrite) throw new Error("Quota exceeded"); values.set(key, value); },
  };
  const exports = {} as Preference;
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.equal(name, "react");
      return { useSyncExternalStore: (...args: [unknown, () => boolean, () => boolean]) => { hooks.push(args); return server ? args[2]() : args[1](); } };
    },
    ...(!server ? { window: {
      localStorage: storage,
      addEventListener: (name: string, fn: (event: StorageEventLike) => void) => { assert.equal(name, "storage"); events.add(fn); },
      removeEventListener: (name: string, fn: (event: StorageEventLike) => void) => { assert.equal(name, "storage"); events.delete(fn); },
    } } : {}),
  });
  return {
    api: exports, values, storage, events, hooks,
    blockRead: () => { blockedRead = true; },
    blockWrite: () => { blockedWrite = true; },
    external: (key: string | null, value: string | null, storageArea: unknown = storage) => {
      if (storageArea === storage) {
        if (key === null) values.clear();
        else if (value === null) values.delete(key);
        else values.set(key, value);
      }
      events.forEach((fn) => fn({ key, newValue: value, storageArea }));
    },
  };
}

test("activity is off by default, persists explicit choices, and rejects unknown stored values", () => {
  const p = page();
  const key = p.api.ACTIVITY_NOTIFICATIONS_KEY;
  assert.equal(p.api.getActivityNotifications(), false);
  p.api.setActivityNotifications(true);
  assert.equal(p.values.get(key), "1");
  assert.equal(page(p.values).api.getActivityNotifications(), true);
  p.api.setActivityNotifications(false);
  assert.equal(page(p.values).api.getActivityNotifications(), false);
  p.values.set(key, "true");
  assert.equal(p.api.getActivityNotifications(), false);
});

test("SSR and hydration use a false snapshot even when this browser opted in", () => {
  const p = page();
  p.api.setActivityNotifications(true);
  assert.equal(p.api.useActivityNotifications(), true);
  const [subscribe, snapshot, serverSnapshot] = p.hooks[0];
  assert.equal(subscribe, p.api.subscribeActivityNotifications);
  assert.equal(snapshot, p.api.getActivityNotifications);
  assert.equal((serverSnapshot as () => boolean)(), false);
  const ssr = page(p.values, true);
  assert.equal(ssr.api.useActivityNotifications(), false);
  ssr.api.setActivityNotifications(true);
  assert.equal(ssr.api.getActivityNotifications(), false);
  assert.doesNotThrow(() => ssr.api.subscribeActivityNotifications(() => {})());
});

test("denied writes keep an in-memory choice even if old storage remains readable", () => {
  const p = page();
  p.api.setActivityNotifications(false);
  p.blockWrite();
  let notified = 0;
  const unsubscribe = p.api.subscribeActivityNotifications(() => notified++);
  p.api.setActivityNotifications(true);
  assert.equal(p.api.getActivityNotifications(), true);
  assert.equal(p.values.get(p.api.ACTIVITY_NOTIFICATIONS_KEY), "0");
  assert.equal(notified, 1);
  p.api.setActivityNotifications(false);
  assert.equal(p.api.getActivityNotifications(), false);
  assert.equal(notified, 2);
  unsubscribe();
});

test("denied reads fall back quietly and explicit changes still update the current page", () => {
  const p = page();
  p.blockRead();
  p.blockWrite();
  assert.equal(p.api.getActivityNotifications(), false);
  p.api.setActivityNotifications(true);
  assert.equal(p.api.getActivityNotifications(), true);
});

test("cross-tab updates and clears synchronize through one shared listener, with cleanup", () => {
  const p = page();
  const seen: boolean[] = [];
  const offOne = p.api.subscribeActivityNotifications(() => seen.push(p.api.getActivityNotifications()));
  const offTwo = p.api.subscribeActivityNotifications(() => {});
  assert.equal(p.events.size, 1);
  const key = p.api.ACTIVITY_NOTIFICATIONS_KEY;
  p.external(key, "1");
  p.external("unrelated", "1");
  p.external(key, "0", {}); // sessionStorage or another storage area is not this preference.
  assert.deepEqual(seen, [true]);
  p.external(key, "0");
  p.external(key, "1");
  p.external(null, null);
  assert.deepEqual(seen, [true, false, true, false]);
  offOne();
  assert.equal(p.events.size, 1);
  offTwo();
  assert.equal(p.events.size, 0);
});

// Mock @/lib/db for tests. Exports maybeDb() returning a fake postgres tagged-template
// function whose behavior is driven by a global mock state set by the test.
import type { Db } from "./db.ts";

type MockState = {
  nonceRows: Record<string, { nonce: string; used_at: string | null; wallet: string; token: string; chain_id: number; expires_at: string }>;
  launcherRows: Record<string, { launcher: string; name: string; symbol: string }>;
  metaInserted: boolean;
  verifyShouldThrow: boolean;
  verifyResult: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __editMock: MockState | undefined;
}

export function resetMock() {
  globalThis.__editMock = {
    nonceRows: {},
    launcherRows: {},
    metaInserted: false,
    verifyShouldThrow: false,
    verifyResult: true,
  };
}

export function getMock(): MockState {
  if (!globalThis.__editMock) resetMock();
  return globalThis.__editMock!;
}

// A fake db tagged-template function. It inspects the SQL text to decide what to return.
function fakeDb(strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]> {
  const sql = strings.join("?");
  const m = getMock();

  // UPDATE bb_edit_nonces SET used_at = now() ... RETURNING nonce
  if (sql.includes("UPDATE bb_edit_nonces") && sql.includes("used_at")) {
    const nonce = String(values[0]);
    const row = m.nonceRows[nonce];
    if (!row || row.used_at !== null) return Promise.resolve([] as any[]);
    row.used_at = new Date().toISOString();
    return Promise.resolve([{ nonce }] as any[]);
  }

  // launcher lookup (issueNonce and applySignedEdit)
  if (sql.includes("FROM bb_launches") && sql.includes("launcher")) {
    const token = String(values[1]);
    const row = m.launcherRows[token];
    if (!row) return Promise.resolve([] as any[]);
    if (sql.includes("name, symbol")) return Promise.resolve([row] as any[]);
    return Promise.resolve([{ launcher: row.launcher }] as any[]);
  }

  // metadata write
  if (sql.includes("bb_launch_meta")) {
    m.metaInserted = true;
    return Promise.resolve([] as any[]);
  }

  // nonce insert (issueNonce)
  if (sql.includes("bb_edit_nonces") && sql.startsWith("?") === false && sql.includes("VALUES")) {
    return Promise.resolve([] as any[]);
  }

  // nonce consume (UPDATE used_at) — handled above by the used_at check
  // expired nonce cleanup
  if (sql.includes("DELETE") && sql.includes("bb_edit_nonces")) {
    return Promise.resolve([] as any[]);
  }

  return Promise.resolve([] as any[]);
}

// Attach properties the real db has (so type checks pass)
// begin() runs the callback with the same fake db (no real transaction, but
// the mock tracks nonce consumption so tests can assert on it)
(fakeDb as any).begin = async (fn: (tx: any) => Promise<any>) => fn(fakeDb);

export function maybeDb(): any | null {
  return fakeDb as any;
}

export function dbConfigured(): boolean {
  return true;
}

export function db(): any {
  return fakeDb as any;
}

export type { Db };

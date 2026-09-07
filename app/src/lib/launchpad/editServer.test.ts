import { test } from "node:test";
import assert from "node:assert/strict";
import { resetMock, getMock } from "@/lib/db-mock";
import * as ed from "./editServer.ts";

// These tests exercise applySignedEdit with mocked DB and RPC (TEST_MOCK_DB=1
// swaps @/lib/db and @/lib/chain for mocks). The mock state lives on globalThis.

const CHAIN = "base";
const TOKEN = "0x" + "11".repeat(20);
const WALLET = "0x" + "ab".repeat(20);
const NONCE = "a".repeat(32);
const SIG = "0x" + "c".repeat(130);

function seedNonce(used = false) {
  const m = getMock();
  m.nonceRows[NONCE] = {
    nonce: NONCE,
    used_at: used ? "2026-01-01T00:00:00Z" : null,
    wallet: WALLET.toLowerCase(),
    token: TOKEN.toLowerCase(),
    chain_id: 8453,
    expires_at: new Date(Date.now() + 300_000).toISOString(),
  };
}

function seedLauncher() {
  const m = getMock();
  m.launcherRows[TOKEN.toLowerCase()] = {
    launcher: WALLET.toLowerCase(),
    name: "Test",
    symbol: "TST",
  };
}

function editRequest(overrides: Record<string, unknown> = {}) {
  return {
    chain: CHAIN,
    token: TOKEN,
    wallet: WALLET,
    nonce: NONCE,
    expiresAt: Date.now() + 300_000,
    signature: SIG,
    fields: { description: "hello" },
    ...overrides,
  };
}

// ── Finding 2: nonce consumed before verifyMessage ──

test("applySignedEdit: RPC error during verify does NOT consume the nonce (returns 503)", async () => {
  resetMock();
  seedNonce();
  seedLauncher();
  const m = getMock();
  m.verifyShouldThrow = true; // simulate RPC blip
  m.verifyResult = false;

  const r = await ed.applySignedEdit(editRequest());

  // BUG (current code): returns 401 "signature does not match" and nonce is consumed.
  // FIX (expected):   returns 503, nonce stays reusable.
  assert.equal(r.ok, false, "should fail");
  assert.equal(r.status, 503, "RPC error should be 503, not 401");
  // The nonce must NOT be consumed
  assert.equal(m.nonceRows[NONCE].used_at, null, "nonce must not be consumed on RPC error");
  assert.equal(m.metaInserted, false, "metadata must not be written on RPC error");
});

test("applySignedEdit: invalid signature does NOT consume the nonce (returns 401)", async () => {
  resetMock();
  seedNonce();
  seedLauncher();
  const m = getMock();
  m.verifyShouldThrow = false;
  m.verifyResult = false; // signature is genuinely invalid

  const r = await ed.applySignedEdit(editRequest());

  assert.equal(r.ok, false, "should fail");
  assert.equal(r.status, 401, "invalid signature should be 401");
  // The nonce must NOT be consumed when the signature is invalid
  assert.equal(m.nonceRows[NONCE].used_at, null, "nonce must not be consumed on invalid signature");
});

test("applySignedEdit: valid signature consumes the nonce and writes metadata", async () => {
  resetMock();
  seedNonce();
  seedLauncher();
  const m = getMock();
  m.verifyShouldThrow = false;
  m.verifyResult = true;

  const r = await ed.applySignedEdit(editRequest());

  assert.equal(r.ok, true, "should succeed");
  assert.notEqual(m.nonceRows[NONCE].used_at, null, "nonce should be consumed on success");
  assert.equal(m.metaInserted, true, "metadata should be written on success");
});

test("applySignedEdit: already-used nonce is rejected (401)", async () => {
  resetMock();
  seedNonce(true); // already used
  seedLauncher();
  const m = getMock();
  m.verifyResult = true;

  const r = await ed.applySignedEdit(editRequest());

  assert.equal(r.ok, false, "should fail");
  assert.equal(r.status, 401, "reused nonce should be 401");
});

// ── Finding 1: rateLimited keyed on unproven wallet ──

test("rateLimited: 10 hits on a wallet key 429s the 11th (the DoS mechanism)", () => {
  const key = `test:wallet:doz-${Math.random()}`;
  for (let i = 0; i < 10; i++) {
    assert.equal(ed.rateLimited(key, 10), false, `hit ${i + 1} should be allowed`);
  }
  assert.equal(ed.rateLimited(key, 10), true, "11th hit should be rate-limited");
});

test("rateLimited: a different wallet key is unaffected (cross-wallet isolation)", () => {
  const victim = `test:wallet:vic-${Math.random()}`;
  const attacker = `test:wallet:atk-${Math.random()}`;
  for (let i = 0; i < 10; i++) ed.rateLimited(victim, 10);
  assert.equal(ed.rateLimited(victim, 10), true, "victim frozen");
  assert.equal(ed.rateLimited(attacker, 10), false, "attacker key unaffected");
});

// ── Finding 1: wallet rate limit must not be spent before the signature is verified ──

test("applySignedEdit: 10 requests with an invalid signature do NOT freeze the wallet (rate limit only after verify)", async () => {
  // An attacker sends 10 edit requests with wallet=victim but a bad signature.
  // Before the fix, the route spent the wallet bucket before applySignedEdit,
  // so the victim's next real edit got 429. After the fix, the wallet bucket
  // is only spent after the signature is verified, so the victim is unaffected.
  resetMock();
  seedNonce();
  seedLauncher();
  const m = getMock();
  m.verifyShouldThrow = false;
  m.verifyResult = false; // invalid signature

  for (let i = 0; i < 10; i++) {
    const r = await ed.applySignedEdit(editRequest());
    assert.equal(r.ok, false, `attempt ${i + 1} should fail`);
    assert.equal(r.status, 401, `attempt ${i + 1} should be 401 (invalid sig)`);
  }

  // The nonce must still be unused (verify failed, so nonce was not consumed)
  assert.equal(m.nonceRows[NONCE].used_at, null, "nonce must not be consumed after 10 invalid-sig attempts");

  // Now the real creator sends a valid signed edit — it must NOT be rate-limited
  m.verifyResult = true;
  const r = await ed.applySignedEdit(editRequest());
  assert.equal(r.ok, true, "creator's valid edit must succeed (wallet bucket not frozen by attacker)");
  assert.equal(m.metaInserted, true, "metadata should be written");
});

test("issueNonce: non-creator requests do NOT spend the wallet rate limit", async () => {
  // An attacker asks for a nonce with wallet=victim but is not the creator.
  // Before the fix, the route spent the wallet bucket before issueNonce,
  // so the victim's next real nonce request got 429. After the fix, the
  // wallet bucket is only spent after the creator check passes.
  resetMock();
  // No launcher row seeded → issueNonce returns null (not the creator)

  for (let i = 0; i < 10; i++) {
    const n = await ed.issueNonce(CHAIN, TOKEN, WALLET);
    assert.equal(n, null, `attempt ${i + 1} by non-creator should return null`);
  }

  // Now seed the launcher and verify the real creator can still get a nonce
  seedLauncher();
  const n = await ed.issueNonce(CHAIN, TOKEN, WALLET);
  assert.ok(n && "nonce" in n, "creator must still be able to get a nonce (bucket not frozen)");
});

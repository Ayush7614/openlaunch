#!/usr/bin/env node
/**
 * E2E test for the edit nonce/rate-limit fix (findings 1 and 2).
 * Hits the real Next.js dev server at http://localhost:3000 with a real Postgres DB.
 * Run: node --import tsx/esm --conditions react-server --no-warnings scripts/e2e-edit-fix.mjs
 *
 * Prerequisites:
 *   - Next.js dev server running on :3000 with DATABASE_URL pointing at a test DB
 *   - A bb_launches row for token 0x11...11 with launcher = TEST_WALLET
 *     (0x3A90168A6bA7c975C34B064f35523cd9FFeff85a, derived from TEST_PRIVATE_KEY below)
 *   - BASE_RPC_URL reachable (for signature verification)
 */
import { privateKeyToAccount } from "viem/accounts";
import { buildEditMessage, validateEdit } from "../src/lib/launchpad/editAuth.ts";

const BASE = "http://localhost:3000";
// Disposable test-only key generated solely for this fixture. It has never
// been and must never be funded or granted any permissions; it is public by
// design. Do not reuse it for anything real.
const TEST_PRIVATE_KEY = "0xa29ac736defede5a8eadc689e4ae754da133c9eb9de0706a5c476c06c9457981";
const TEST_WALLET = privateKeyToAccount(TEST_PRIVATE_KEY).address;
const TOKEN = "0x1111111111111111111111111111111111111111";
const ATTACKER_WALLET = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ok - ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL - ${name}${detail ? " :: " + detail : ""}`);
  }
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

async function getNonce(wallet = TEST_WALLET) {
  const r = await post("/api/launch/edit/nonce", { chain: "base", token: TOKEN, wallet });
  return r;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Build the signed message the same way the server does: validateEdit normalizes
// fields (e.g. URL trailing slash), then buildEditMessage uses the normalized
// values. Signing with raw fields would mismatch after normalization.
function serverMessage({ nonce, expiresAt, fields }) {
  const v = validateEdit(fields);
  if (!v.ok) throw new Error(`invalid fields: ${v.error}`);
  return buildEditMessage({ chain: "base", token: TOKEN, wallet: TEST_WALLET, nonce, expiresAt, fields: v.value });
}

async function signEdit({ nonce, expiresAt, fields }) {
  const account = privateKeyToAccount(TEST_PRIVATE_KEY);
  const message = serverMessage({ nonce, expiresAt, fields });
  return account.signMessage({ message });
}

// ── 1. Non-creator cannot get a nonce ──
console.log("\n[1] Non-creator cannot get a nonce");
{
  const r = await getNonce(ATTACKER_WALLET);
  check("non-creator gets 403", r.status === 403, `got ${r.status}`);
  check("non-creator gets 'not the creator'", r.json?.error === "not the creator", `got ${r.json?.error}`);
}

// ── 2. Creator can get a nonce ──
console.log("\n[2] Creator can get a nonce");
let nonce, expiresAt;
{
  const r = await getNonce();
  check("creator gets 200", r.status === 200, `got ${r.status}`);
  check("creator gets a nonce", typeof r.json?.nonce === "string" && r.json.nonce.length === 32, `got ${r.json?.nonce}`);
  check("creator gets expiresAt", typeof r.json?.expiresAt === "number", `got ${r.json?.expiresAt}`);
  nonce = r.json?.nonce;
  expiresAt = r.json?.expiresAt;
}

// ── 3. Finding 1: 11 nonce requests with the creator's wallet do NOT freeze the creator ──
console.log("\n[3] Finding 1: 11 nonce requests with the creator's public address do not freeze the creator");
{
  // The nonce endpoint is unauthenticated (no signature). An attacker who
  // knows the creator's public address can pass the launcher check. Before
  // the fix, the route spent a wallet-keyed bucket, so 10 requests with the
  // creator's address froze the creator's next nonce request. The fix removes
  // the wallet rate limit from the nonce endpoint entirely; the IP limit is
  // the only limit.
  for (let i = 0; i < 11; i++) {
    const r = await post("/api/launch/edit/nonce", { chain: "base", token: TOKEN, wallet: TEST_WALLET });
    check(`attacker attempt ${i + 1} with creator address returns 200`, r.status === 200, `got ${r.status} ${r.json?.error}`);
  }
  // The creator must still be able to get a nonce
  const r = await getNonce();
  check("creator still gets a nonce after 11 attacker requests", r.status === 200 && typeof r.json?.nonce === "string", `got ${r.status} ${r.json?.error}`);
}

// ── 4. Finding 2: invalid signature does NOT burn the nonce ──
console.log("\n[4] Finding 2: invalid signature does not burn the nonce (returns 401, nonce reusable)");
{
  const r = await getNonce();
  check("got a fresh nonce for invalid-sig test", r.status === 200, `got ${r.status}`);
  const n = r.json.nonce;
  const exp = r.json.expiresAt;

  // Submit an edit with a bogus signature (valid hex, wrong sig)
  const badSig = "0x" + "d".repeat(130);
  const edit = await post("/api/launch/edit", {
    chain: "base",
    token: TOKEN,
    wallet: TEST_WALLET,
    nonce: n,
    expiresAt: exp,
    signature: badSig,
    fields: { description: "test edit" },
  });
  check("invalid signature gets 401", edit.status === 401, `got ${edit.status}`);
  check("invalid signature error is 'signature does not match'", edit.json?.error === "signature does not match", `got ${edit.json?.error}`);

  // The nonce must still be usable: submit with the CORRECT signature
  const goodSig = await signEdit({ nonce: n, expiresAt: exp, fields: { description: "real edit" } });
  const edit2 = await post("/api/launch/edit", {
    chain: "base",
    token: TOKEN,
    wallet: TEST_WALLET,
    nonce: n,
    expiresAt: exp,
    signature: goodSig,
    fields: { description: "real edit" },
  });
  check("same nonce works with valid signature (nonce was not burned)", edit2.status === 200, `got ${edit2.status} ${edit2.json?.error}`);
}

// ── 5. Valid signature consumes the nonce and writes metadata ──
console.log("\n[5] Valid signature consumes the nonce and writes metadata");
{
  const r = await getNonce();
  const n = r.json.nonce;
  const exp = r.json.expiresAt;

  const sig = await signEdit({ nonce: n, expiresAt: exp, fields: { description: "hello e2e", website: "https://example.com" } });
  const edit = await post("/api/launch/edit", {
    chain: "base",
    token: TOKEN,
    wallet: TEST_WALLET,
    nonce: n,
    expiresAt: exp,
    signature: sig,
    fields: { description: "hello e2e", website: "https://example.com" },
  });
  check("valid edit gets 200", edit.status === 200, `got ${edit.status} ${edit.json?.error}`);

  // Reuse the nonce with the SAME fields and signature (so the signature
  // still verifies) → the nonce consume must fail because it's already used
  const reuse = await post("/api/launch/edit", {
    chain: "base",
    token: TOKEN,
    wallet: TEST_WALLET,
    nonce: n,
    expiresAt: exp,
    signature: sig,
    fields: { description: "hello e2e", website: "https://example.com" },
  });
  check("reused nonce is rejected (401)", reuse.status === 401, `got ${reuse.status} ${reuse.json?.error}`);
  check("reused nonce error mentions invalid or already used", /invalid or already used/.test(reuse.json?.error ?? ""), `got ${reuse.json?.error}`);
}

// ── 6. Finding 1 (edit side): 10 invalid-sig edit requests do NOT freeze the creator ──
console.log("\n[6] Finding 1: 10 invalid-sig edit requests do not freeze the creator's edit budget");
{
  // Get a nonce (the creator's budget should not be frozen by the attacker)
  const r = await getNonce();
  check("creator can get a nonce for the edit-DoS test", r.status === 200, `got ${r.status}`);
  const n = r.json.nonce;
  const exp = r.json.expiresAt;

  // Attacker sends 10 edit requests with the creator's wallet but bad signatures.
  // Before the fix, the route spent the wallet bucket before applySignedEdit,
  // so the creator's next real edit got 429.
  const badSig = "0x" + "e".repeat(130);
  for (let i = 0; i < 10; i++) {
    await post("/api/launch/edit", {
      chain: "base",
      token: TOKEN,
      wallet: TEST_WALLET,
      nonce: n,
      expiresAt: exp,
      signature: badSig,
      fields: { description: "attacker" },
    });
  }

  // The creator's valid edit must NOT be rate-limited
  const sig = await signEdit({ nonce: n, expiresAt: exp, fields: { description: "creator real edit" } });
  const edit = await post("/api/launch/edit", {
    chain: "base",
    token: TOKEN,
    wallet: TEST_WALLET,
    nonce: n,
    expiresAt: exp,
    signature: sig,
    fields: { description: "creator real edit" },
  });
  check("creator's valid edit succeeds after 10 attacker attempts (not 429)", edit.status === 200, `got ${edit.status} ${edit.json?.error}`);
}

// ── 7. Non-creator cannot edit (even with a valid signature from someone else) ──
console.log("\n[7] Non-creator cannot edit");
{
  const r = await getNonce();
  // This should fail because the nonce was issued to TEST_WALLET, but
  // even if we craft a request with ATTACKER_WALLET, the launcher check fails.
  const edit = await post("/api/launch/edit", {
    chain: "base",
    token: TOKEN,
    wallet: ATTACKER_WALLET,
    nonce: r.json.nonce,
    expiresAt: r.json.expiresAt,
    signature: "0x" + "f".repeat(130),
    fields: { description: "attacker edit" },
  });
  check("non-creator edit is rejected", edit.status === 403 || edit.status === 401 || edit.status === 400, `got ${edit.status}`);
}

// ── 8. IP rate limit still works (sanity check) ──
console.log("\n[8] IP rate limit still works (sanity)");
{
  // The IP limiter on the nonce route is 30/min. Hit it 32 times with a
  // unique X-Forwarded-For to confirm the IP bucket is keyed on IP, not wallet.
  let lastStatus = 0;
  for (let i = 0; i < 32; i++) {
    const r = await post("/api/launch/edit/nonce", { chain: "base", token: TOKEN, wallet: ATTACKER_WALLET }, { "x-forwarded-for": `10.0.0.${i % 256}` });
    lastStatus = r.status;
  }
  // The attacker wallet gets 403 (not the creator), not 429, because the
  // wallet bucket is now inside issueNonce (after the creator check).
  // The IP bucket is separate and has a 30/min limit, but each request here
  // uses a different IP, so no 429. This confirms the IP limiter is keyed
  // on IP, not wallet.
  check("IP-keyed requests don't 429 on wallet bucket", lastStatus === 403, `got ${lastStatus}`);

  // Now repeat a single IP past the 30/min limit. The IP check runs before
  // issueNonce, so the 31st request must get 429 regardless of wallet. This
  // would pass even with no limiter if every request used a fresh IP, so a
  // repeated single IP is the only way to prove the limiter actually fires.
  let saw429 = false;
  let singleIpLast = 0;
  for (let i = 0; i < 32; i++) {
    const r = await post("/api/launch/edit/nonce", { chain: "base", token: TOKEN, wallet: ATTACKER_WALLET }, { "x-forwarded-for": "10.1.2.3" });
    singleIpLast = r.status;
    if (r.status === 429) { saw429 = true; break; }
  }
  check("a single repeated IP eventually gets 429", saw429, `last status ${singleIpLast}`);
}

// ── Summary ──
console.log(`\n${"=".repeat(60)}`);
console.log(`E2E results: ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All e2e checks passed.");
process.exit(0);

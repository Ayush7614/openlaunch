import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Source contracts for the Earn components (like bridge-ui.test.ts): they hold the money-moving rules in place.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const hook = read("./useEarn.ts");
const card = read("./EarnCard.tsx");
const dialog = read("./EarnDialog.tsx");
const panel = read("./EarnPanel.tsx");
const calls = read("../../lib/earn/calls.ts");
const dashboard = read("../launchpad/MeDashboard.tsx");
const reviewPage = read("../../app/ui-review-earn/page.tsx");
const allEarn = [hook, card, dialog, panel, calls, read("../../lib/earn/math.ts"), read("../../lib/earn/terms.ts"), read("../../lib/earn/server.ts"), read("../../lib/earn/vaults.ts")];

test("every wallet write is credited to the builder code", () => {
  const direct = hook.match(/writeContract\(\{[^}]*\}/g) ?? [];
  assert.ok(direct.length >= 1);
  for (const w of direct) assert.match(w, /dataSuffix: BUILDER_DATA_SUFFIX/, w);
  const simulated = hook.match(/simulateContract\(\{[^}]*\}/g) ?? [];
  assert.equal(simulated.length, 3); // deposit, redeem, withdraw
  for (const s of simulated) assert.match(s, /dataSuffix: BUILDER_DATA_SUFFIX/, s);
  // a prepared request is only ever sent as simulated (the suffix travels inside it)
  assert.equal((hook.match(/writeContract\(request\)/g) ?? []).length, 3);
  assert.match(hook, /sendCalls\(config, \{ account, chainId, calls, capabilities: EARN_BATCH_CAPABILITIES, forceAtomic: true \}\)/);
  assert.match(calls, /const tagged = \(data: Hex\): Hex => concatHex\(\[data, BUILDER_DATA_SUFFIX\]\)/);
});

test("approvals are exact: no unlimited allowance anywhere in Earn", () => {
  for (const src of allEarn) assert.doesNotMatch(src, /maxUint256|maxUint160|2n \*\* 256n/);
  assert.match(hook, /functionName: "approve", args: \[vault\.address, amount\]/);
});

test("both actions lock before their first await and simulate before any signature", () => {
  for (const name of ["deposit", "withdraw"]) {
    const body = hook.slice(hook.indexOf(`async function ${name}()`));
    const lockAt = body.indexOf("lock.current = true");
    assert.ok(lockAt > 0, name);
    assert.ok(lockAt < body.indexOf("await "), `${name} awaits before locking`);
  }
  const deposit = hook.slice(hook.indexOf("async function deposit()"), hook.indexOf("async function withdraw()"));
  assert.ok(deposit.indexOf("termsCheck(vault, await readTerms(pub, vault))") < deposit.indexOf("sendBatch("), "terms are checked before any send");
  assert.ok(deposit.indexOf("simulateContract(") < deposit.indexOf("writeContract(request)"));
});

test("a deposit pause is derived from a polled read, never stored, so it cannot stick after the terms recover", () => {
  assert.doesNotMatch(hook, /setPaused|useState<string \| null>/);
  assert.match(hook, /useReadContracts\(\{[\s\S]*?query: \{ refetchInterval: 60_000 \}/);
  for (const fn of ["asset", "performanceFee", "managementFee", "receiveSharesGate", "sendSharesGate", "receiveAssetsGate", "sendAssetsGate"]) assert.match(hook, new RegExp(`functionName: "${fn}"`), fn);
  assert.match(panel, /const pauseReason = depositPause\(e\.liveTerms, snapshot\?\.terms \?\? null\);/);
  // a failed send-time check refreshes the polled read so the form shows the pause at once
  const deposit = hook.slice(hook.indexOf("async function deposit()"), hook.indexOf("async function withdraw()"));
  assert.match(deposit, /if \(!check\.ok\) \{\s*void terms\.refetch\(\);[^\n]*\n\s*throw new Error\(pausedCopy\(check\.reason\)\);/);
});

test("an upgrade-to-smart-account prompt is never triggered", () => {
  assert.match(calls, /c\.atomic\?\.status === "supported"/);
  assert.doesNotMatch(calls, /status === "ready"/);
});

test("the card shows only while the switch is on, and the sheet loads on first use", () => {
  assert.match(card, /info\?\.enabled \?/);
  assert.match(card, /if \(!entry \|\| !vault\) return null;/);
  assert.match(card, /dynamic\(\(\) => import\("\.\/EarnDialog"\), \{ ssr: false \}\)/);
  assert.match(card, /id="earn"/);
  assert.equal((dashboard.match(/<SeasonCard address=\{address\} \/>\n\s*<EarnCard address=\{address\} \/>/g) ?? []).length, 2);
});

test("the copy states the risk and the absence of any openlaunch fee, and makes no promise", () => {
  assert.match(panel, /Deposits can lose money\./);
  assert.match(panel, /openlaunch never holds your funds, cannot move them and cannot guarantee a withdrawal/);
  assert.match(panel, /<dt>openlaunch fee<\/dt><dd>None<\/dd>/);
  assert.match(dialog, /0 openlaunch fee/);
  assert.match(card, /Can lose money\. No openlaunch fee\./);
  for (const src of [card, dialog, panel]) {
    assert.doesNotMatch(src, /Base Earn|Coinbase|high[- ]yield|guaranteed (?:return|yield|rate)|risk[- ]free|\bsafe\b/i);
  }
});

test("the review page is development-only", () => {
  assert.match(reviewPage, /process\.env\.NODE_ENV !== "development"\) notFound\(\)/);
});

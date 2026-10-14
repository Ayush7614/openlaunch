import assert from "node:assert/strict";
import test from "node:test";
import { zeroAddress } from "viem";
import { pausedCopy, termsCheck, type LiveTerms } from "./terms.ts";
import { EARN_VAULTS } from "./vaults.ts";

const vault = EARN_VAULTS.base!;
const asListed: LiveTerms = { asset: vault.asset, performanceFee: 0n, managementFee: 0n, gates: [zeroAddress, zeroAddress, zeroAddress, zeroAddress] };

test("the vault as reviewed passes, whatever the address case", () => {
  assert.deepEqual(termsCheck(vault, asListed), { ok: true });
  assert.deepEqual(termsCheck(vault, { ...asListed, asset: vault.asset.toLowerCase() as `0x${string}` }), { ok: true });
});

test("any change that costs or restricts a depositor stops deposits with the reason", () => {
  const swapped = termsCheck(vault, { ...asListed, asset: "0x0000000000000000000000000000000000000001" });
  assert.deepEqual(swapped, { ok: false, reason: "The vault no longer takes USDC." });
  const perf = termsCheck(vault, { ...asListed, performanceFee: 100_000_000_000_000_000n });
  assert.deepEqual(perf, { ok: false, reason: "The vault now keeps 10% of the interest it earns." });
  const mgmt = termsCheck(vault, { ...asListed, managementFee: 10_000_000_000_000_000n / 31_536_000n });
  assert.equal(mgmt.ok, false);
  assert.match((mgmt as { reason: string }).reason, /^The vault now charges a 1% yearly management fee\.$/);
  for (let i = 0; i < 4; i++) {
    const gates = [zeroAddress, zeroAddress, zeroAddress, zeroAddress] as `0x${string}`[];
    gates[i] = "0x00000000000000000000000000000000000000aa";
    assert.deepEqual(termsCheck(vault, { ...asListed, gates }), { ok: false, reason: "The vault now restricts who may use it." });
  }
});

test("the paused notice says withdrawals stay open", () => {
  assert.match(pausedCopy("The vault now restricts who may use it."), /Withdrawals stay open\.$/);
});

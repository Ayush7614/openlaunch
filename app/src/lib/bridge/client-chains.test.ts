import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CHAINS, CHAIN_KEYS } from "../chainPublic";
import { arc, BRIDGE_WALLET_CHAINS } from "./chains";
import { BRIDGE_CHAIN_IDS, BRIDGE_CHAINS } from "./types";

test("every bridge source has a matching wallet chain without extending launch networks", () => {
  for (const id of BRIDGE_CHAIN_IDS) {
    const walletChain = BRIDGE_WALLET_CHAINS[id];
    assert.equal(walletChain.id, id);
    assert.equal(walletChain.nativeCurrency.symbol, BRIDGE_CHAINS[id].symbol);
    assert.equal(walletChain.nativeCurrency.decimals, 18);
    assert.ok(walletChain.rpcUrls.default.http.length > 0);
  }
  assert.deepEqual(CHAIN_KEYS, ["base", "robinhood"]);
  assert.equal(Object.hasOwn(CHAINS, "arc"), false);
  assert.equal(arc.rpcUrls.default.http[0], "https://rpc.mainnet.arc.io");
  assert.equal(arc.blockExplorers.default.url, "https://explorer.arc.io");
  assert.equal(arc.nativeCurrency.symbol, "USDC");
  assert.notEqual(arc.id, 5042002);
});

test("wallet config registers Arc for switching and native-balance reads", () => {
  const config = readFileSync(new URL("../wagmi.ts", import.meta.url), "utf8");
  assert.match(config, /chains:\s*\[CHAINS\.base,\s*robinhood,\s*arc\]/);
  assert.match(config, /\[arc\.id\]:\s*http\(arc\.rpcUrls\.default\.http\[0\]/);
  const hook = readFileSync(new URL("../../components/bridge/useBridge.ts", import.meta.url), "utf8");
  assert.match(hook, /chain:\s*BRIDGE_WALLET_CHAINS\[q\.originChainId\]/);
  assert.doesNotMatch(hook, /CHAINS\[BRIDGE_CHAINS/);
});

test("approval polling waits for a hash and restarts when the same journal gains one", () => {
  const hook = readFileSync(new URL("../../components/bridge/useBridge.ts", import.meta.url), "utf8");
  assert.match(hook, /const approvalHash = approval\?\.approvalHash;/);
  assert.match(hook, /if \(!address \|\| !approvalId \|\| !approvalHash\) return;/);
  assert.match(hook, /\[address, approvalId, approvalHash, approvalPollRevision, config\]/);
  assert.match(hook, /observed\.approvalHash !== approvalHash\) return;/);
  assert.match(hook, /pub\.getTransactionReceipt\(\{ hash: approvalHash \}\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./WalletMenu.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./WalletMenu.module.css", import.meta.url), "utf8");
const adapter = readFileSync(new URL("./ConnectButton.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("./HeaderNav.tsx", import.meta.url), "utf8");

// Source contracts supplement browser QA without connecting, signing, or
// disconnecting a real wallet. They are not a simulated wagmi integration test.
test("connected wallet chip is an account disclosure, never a one-click disconnect", () => {
  const trigger = source.slice(source.indexOf("<Popover.Trigger"), source.indexOf("</Popover.Trigger>"));
  assert.match(trigger, /Open account menu/);
  assert.doesNotMatch(trigger, /onDisconnect|runAction|onClick/);
  assert.match(source, /<Popover.Root\b[^>]*open=\{open\} onOpenChange=/);
  assert.match(source, /className=\{styles.disconnect\} disabled=\{busy\} onClick=\{\(\) => void runAction\("disconnect"\)\}/);
  assert.match(source, /if \(target === "disconnect"\)\s*\{\s*await onDisconnect\(\);\s*setOpen\(false\)/);
  assert.match(source, /<AccountMenu key=\{props.address.toLowerCase\(\)\}/);
});

test("wallet adapter preserves hydration, connector preference, and explicit async actions", () => {
  assert.match(adapter, /useSyncExternalStore\(/);
  assert.match(adapter, /if \(!mounted\) return <div/);
  assert.match(adapter, /if \(!isConnected \|\| !address\)/);
  assert.match(adapter, /connectors.find\(\(c\) => c.id === "coinbaseWallet"\) \?\? connectors\[0\]/);
  assert.match(adapter, /disabled=\{isPending \|\| !connector\}/);
  assert.match(adapter, /connector && connect\(\{ connector \}\)/);
  assert.match(adapter, /onSwitchChain=\{\(chain\) => switchChainAsync\(\{ chainId: CHAINS\[chain\].id \}\)\}/);
  assert.match(adapter, /onDisconnect=\{\(\) => disconnectAsync\(\)\}/);
  assert.match(adapter, /switching=\{switching\} disconnecting=\{disconnecting\}/);
});

test("unknown networks stay unknown and never get an inferred explorer destination", () => {
  assert.match(source, /const key = chainKeyOf\(chainId\)/);
  assert.match(source, /key \? CHAIN_SHORT\[key\] : "Unsupported network"/);
  assert.match(source, /\{key \? \(\s*<a[^>]*href=\{explorerAddress\(key, address\)\}/);
  assert.match(source, /explorerName\(key\)/);
  assert.match(source, /This network isn’t supported\. Choose one below\./);
  assert.match(source, /CHAIN_KEYS.map\(\(chain\) =>/);
  assert.match(source, /aria-pressed=\{chain === key\}/);
  assert.doesNotMatch(source, /chainKeyOf\(chainId\)\s*(?:\|\||\?\?)\s*"base"|explorerAddress\("base"/);
});

test("pending actions are locked against duplicate requests and rejection is recoverable", () => {
  assert.match(source, /const busy = switching \|\| disconnecting \|\| localBusy !== null/);
  assert.match(source, /if \(busy \|\| actionLock.current \|\| target === key\) return/);
  assert.match(source, /actionLock.current = true/);
  assert.match(source, /await onSwitchChain\(target\)/);
  assert.match(source, /finally\s*\{\s*actionLock.current = false;\s*setLocalBusy\(null\)/);
  assert.match(source, /Network switch wasn’t completed\. Try again in your wallet\./);
  assert.match(source, /Couldn’t disconnect\. Try again\./);
  assert.match(source, /disabled=\{busy\} onClick=\{\(\) => void runAction\(chain\)\}/);
  assert.match(source, /role="status" aria-live="polite"/);
});

test("wallet shortcuts copy the full address and close the nested menu on navigation", () => {
  assert.match(source, /await navigator.clipboard.writeText\(address\)/);
  assert.match(source, /Address copied\./);
  assert.match(source, /Couldn’t copy\. Select the address above to copy it manually\./);
  assert.match(source, /aria-label="Full wallet address">\{address\}/);
  assert.match(source, /href="\/me"[^>]*onClick=\{\(\) => \{ setOpen\(false\); onNavigate\?\.\(\)/);
  assert.match(header, /<ConnectButton block onNavigate=\{\(\) => setOpen\(false\)\}/);
  assert.match(source, /<Popover.Portal>/);
  assert.match(source, /<Popover.Root modal=\{block\}/);
  assert.match(source, /aria-modal=\{block \|\| undefined\}/);
  assert.match(source, /block \? <Popover.Backdrop className=\{styles.backdrop\}/);
  assert.match(source, /collisionPadding=\{12\} positionMethod="fixed"/);
  assert.match(source, /event.key === "Escape"\) \{ event.stopPropagation\(\); setOpen\(false\)/);
  assert.match(source, /aria-label="Close wallet menu"/);
});

test("wallet presentation has no signing, transaction, balance, polling, or tracking work", () => {
  assert.doesNotMatch(source + adapter, /useSignMessage|signMessage\(|signTypedData\(|writeContract\(|sendTransaction\(|useBalance|useReadContract|fetch\(|setInterval\(|localStorage|sessionStorage/);
  assert.match(source, /walletMark\(address\)/);
  assert.doesNotMatch(source, /Math.random\(|Date.now\(|verified identity|verified wallet/i);
});

test("wallet menu stays theme-native, bounded on mobile, keyboard-accessible, and motion-aware", () => {
  assert.match(css, /width: min\(336px, calc\(100vw - 24px\)\)/);
  assert.match(css, /max-height: min\(var\(--available-height\), calc\(100dvh - 24px\)\)/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /\.mobilePositioner\s*\{[^}]*inset: auto 12px max\(12px, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /max-height: calc\(100dvh - 32px - env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition: none/);
  assert.match(css, /background: var\(--color-paper\)/);
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b|gradient\(|box-shadow:|text-shadow:|animation:/i);
  assert.doesNotMatch(source + css, /\u2014/);
});

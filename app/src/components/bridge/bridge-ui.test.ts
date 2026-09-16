import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const panel = read("./BridgeDialog.tsx");
const provider = read("./BridgeProvider.tsx");
const header = read("../HeaderNav.tsx");
const css = read("./BridgeDialog.module.css");

test("bridge uses bundled official asset marks rather than letter placeholders", () => {
  for (const asset of ["base.svg", "robinhood-black.svg", "robinhood-white.svg", "ethereum.svg", "arc.svg", "usdc.svg"]) {
    assert.ok(panel.includes(`/brand/${asset}`), asset);
    const svg = read(`../../../public/brand/${asset}`);
    assert.match(svg, /<svg\b/);
    assert.match(svg, /Source(?: asset| archive)?: https:\/\//);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bonload=|(?:href|src)=["']https?:/i);
  }
  assert.doesNotMatch(panel, /\? "B" : "R"/);
  assert.match(css, /:global\(\.dark\) \.networkMark \.lightLogo/);
  assert.match(css, /:global\(\.dark\) \.networkMark \.darkLogo/);
  assert.match(panel, /<AssetMark asset=\{asset\} size=\{28\} \/>/);
  assert.match(panel, /<AssetMark asset=\{outputCurrency.symbol\} \/>/);
});

test("bridge keeps one lazily loaded controller across desktop/mobile and dismissal", () => {
  assert.match(header, /<BridgeProvider>/);
  assert.match(header, /<BridgeButton \/>/);
  assert.match(header, /<BridgeButton block onOpen=\{\(\) => setOpen\(false\)\} \/>/);
  assert.match(provider, /dynamic\(\(\) => import\("\.\/BridgeDialog"\)/);
  assert.match(provider, /activated \? <BridgeDialog/);
  assert.doesNotMatch(provider, /open \? <BridgeDialog/);
});

test("bridge review names minimum, separate gas, recipient, risk and expiry", () => {
  for (const content of ["Minimum received", "Source gas", "Receiving wallet", "0.5% slippage", "carries risk", "This quote expired", "Refresh quote", "0 Openlaunch fee"]) assert.ok(panel.includes(content), content);
  assert.match(panel, /reviewing \? b.approvalRequired \? b.approve\(\) : b.confirm\(\) : b.requestQuote\(\)/);
  assert.doesNotMatch(panel, /dangerouslySetInnerHTML|setInterval|sendTransaction/);
});

test("bridge dialog has accessible focus, mobile layout and reduced motion", () => {
  assert.match(panel, /Dialog.Popup[^>]+initialFocus=\{popup\}/);
  assert.match(panel, /finalFocus=\{connecting \? false : restoreFocus\}/);
  assert.match(panel, /Dialog.Close[^>]+aria-label="Close bridge"/);
  assert.match(panel, /htmlFor="bridge-amount"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /max-height: calc\(100dvh - 16px\)/);
  assert.match(css, /:focus-visible/);
});

test("both quote and transfer recipients expose the full address without hover", () => {
  assert.match(panel, /<details className=\{styles.recipient\}>[\s\S]*<summary>[\s\S]*<code className=\{styles.fullAddress\}>\{address\}<\/code>/);
  assert.match(panel, /<Recipient address=\{b.address\} \/>/);
  assert.match(panel, /<Recipient address=\{transfer.address\} \/>/);
  assert.match(css, /input, select, summary\):focus-visible/);
});

test("bridge selectors expose three networks and label cross-asset conversion and gas", () => {
  assert.match(panel, /BRIDGE_CHAIN_IDS.map/);
  assert.match(panel, /Select.Trigger[^>]+aria-label=\{`\$\{label\} network`\}/);
  assert.match(panel, /onChange=\{b.setDestinationChainId\}/);
  assert.match(panel, /onClick=\{b.reverseRoute\}/);
  assert.match(panel, /Gas in \{BRIDGE_CHAINS\[chain\].symbol\}/);
  assert.match(panel, /Converted by Relay/);
  assert.match(panel, /Value change/);
  assert.doesNotMatch(panel + provider, /Bridge ETH|relayFeeEth|sourceGasEth|Your ETH is on its way/);
});

test("network pickers use themed Base UI lists without native browser menus", () => {
  assert.match(panel, /import \{ Select \} from "@base-ui\/react\/select"/);
  assert.doesNotMatch(panel, /<select\b|<option\b/);
  assert.match(panel, /Select.Root value=\{chain\} items=\{networkItems\} disabled=\{disabled\}/);
  assert.match(panel, /if \(isBridgeChainId\(value\)\) onChange\(value\)/);
  assert.match(panel, /Select.Portal/);
  assert.match(panel, /alignItemWithTrigger=\{false\}/);
  assert.match(panel, /Select.Item[^>]+label=\{BRIDGE_CHAINS\[id\].name\}/);
  assert.match(panel, /Select.ItemIndicator/);
  assert.match(css, /networkPositioner \{ z-index: 90/);
  assert.match(css, /networkPopup\[data-instant\] \{ transition: none/);
  assert.match(css, /prefers-reduced-motion: reduce[^\n]+\.networkPopup/);
});

test("synthetic bridge review is development-only and cannot execute a transaction", () => {
  assert.match(read("../../app/ui-review-bridge/page.tsx"), /process.env.NODE_ENV !== "development"\) notFound\(\)/);
  const review = read("../../app/ui-review-bridge/BridgeReview.tsx");
  assert.doesNotMatch(review, /sendTransaction|useBridge\(\)|fetch\(/);
  assert.match(review, /No wallet requests, API calls, or funds/);
});

test("USDC approval is visibly separate from the bridge and has chain-aware recovery", () => {
  assert.match(panel, /Approve \$\{nativeAmount\(b.amount\)\} USDC/);
  assert.match(panel, /Approval alone does not move your funds/);
  assert.match(panel, /No bridge deposit has been requested/);
  assert.match(panel, /Review a fresh quote before bridging/);
  assert.match(panel, /approval\.approvalHash/);
  assert.match(panel, /b.recoverApproval\(hash.trim\(\)\)/);
  assert.match(panel, /unspent allowance remains until used or revoked/);
  assert.match(panel, /No wallet request will be made/);
  assert.match(panel, /b.approvalError \|\| b.storageError/);
  assert.match(panel, /approval\.approvalHash \? <button[^>]+onClick=\{b.retryApproval\}/);
  assert.match(panel, /BRIDGE_CHAINS\[approval.chainId\]/);
  assert.match(panel, /approvalChain.explorer/);
});

test("USDC selectors separate selected token units from native gas and disallow unsafe Robinhood routes", () => {
  assert.match(panel, /AssetSelect label="Send"[^>]+onChange=\{b.setOriginAsset\}/);
  assert.match(panel, /AssetSelect label="Receive"[^>]+onChange=\{b.setDestinationAsset\}/);
  assert.match(panel, /BRIDGE_ASSETS\[chain\]/);
  assert.match(panel, /isBridgeAssetSupported\(chain, value\)/);
  assert.match(panel, /formatUnits\(b.balance, inputCurrency.decimals\)/);
  assert.match(panel, /formatUnits\(BigInt\(value\), outputCurrency.decimals\)/);
  assert.match(panel, /For gas: \{nativeAmount\(b.nativeBalance\)\} \{origin.symbol\}/);
  assert.match(panel, /USDC on Robinhood is unavailable/);
  assert.match(panel, /uses additional \{origin.symbol\} for gas/);
  assert.match(panel, /const inputCurrency = bridgeTransferInputCurrency\(transfer\)/);
});

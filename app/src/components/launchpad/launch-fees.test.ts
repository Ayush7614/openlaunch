import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isAddress } from "viem";
import { BPS, FEE_PRESETS } from "../../lib/launchpad/config.ts";
import { shortAddr } from "../../lib/chainPublic.ts";

type Element = { type: string; props: Record<string, unknown>; children: unknown[] };
const source = readFileSync(new URL("./LaunchFeeSettings.tsx", import.meta.url), "utf8");
const formSource = readFileSync(new URL("./LaunchForm.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("LaunchFeeSettings.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "LaunchFeeSettings");
assert.ok(declaration);
const { outputText } = ts.transpileModule(`(${declaration.getText(ast).replace(/^export default /, "")})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
// Exercise the actual JSX and change handlers without a wallet, browser, or transaction.
// Native arrow-key navigation and layout are verified in the browser separately.
const render = runInNewContext(outputText, {
  React: { createElement: (type: string, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: props ?? {}, children }), Fragment: "fragment" },
  useId: () => "fees", FEE_PRESETS, isAddress, shortAddr, card: "card", input: "input",
  styles: new Proxy({}, { get: (_target, key) => key }),
  ArrowUpRight: "ArrowUpRight", Flame: "Flame", LockKeyhole: "LockKeyhole", Wallet: "Wallet",
}) as (props: Record<string, unknown>) => Element;
const defaults = { feePips: 0, beneficiary: "burn", customAddress: "", onFeeChange: () => {}, onBeneficiaryChange: () => {}, onCustomAddressChange: () => {} };

function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("children" in node)) return [];
  const element = node as Element;
  return [element, ...element.children.flatMap(elements)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("children" in node)) return "";
  return (node as Element).children.map(text).join(" ");
}
function change(node: Element, value?: string) {
  (node.props.onChange as (event: { target: { value?: string } }) => void)({ target: { value } });
}

test("fee choices use the configured pips in one native radio group, with zero preserving its burn reset", () => {
  let pips = -1;
  let beneficiary = "custom";
  const output = render({ ...defaults, feePips: 10_000, onFeeChange: (value: number) => { pips = value; }, onBeneficiaryChange: (value: string) => { beneficiary = value; } });
  const rates = elements(output).filter((node) => node.type === "input" && node.props.name === "fees-rate");
  assert.deepEqual(rates.map((node) => node.props.value), FEE_PRESETS.map((fee) => fee.pips));
  assert.ok(rates.every((node) => node.props.type === "radio"));
  assert.deepEqual(rates.map((node) => node.props.checked), [false, true, false]);
  change(rates[2]);
  assert.equal(pips, 30_000);
  assert.equal(beneficiary, "custom", "Choosing a nonzero fee does not silently replace the recipient");
  change(rates[0]);
  assert.equal(pips, 0);
  assert.equal(beneficiary, "burn");
});

test("zero fee hides recipient controls and keeps permanence, gas, and price-impact disclosures", () => {
  const output = render(defaults);
  assert.equal(elements(output).filter((node) => node.type === "input").length, 3);
  assert.match(text(output), /No fees to distribute/);
  assert.match(text(output), /No trading fees are collected/);
  assert.match(text(output), /Network gas and price impact still apply/);
  assert.match(text(output), /fee rate\s+cannot be changed later/);
  assert.doesNotMatch(text(output), /Claimable by|100% of fees/);
});

test("each recipient is controlled and describes an unsplit fee without promising automatic payouts", () => {
  for (const value of ["burn", "me", "custom"]) {
    let chosen = "";
    const output = render({ ...defaults, feePips: 10_000, beneficiary: value, onBeneficiaryChange: (next: string) => { chosen = next; } });
    const recipients = elements(output).filter((node) => node.type === "input" && node.props.name === "fees-recipient");
    assert.equal(recipients.length, 3);
    assert.equal(recipients.find((node) => node.props.checked)?.props.value, value);
    change(recipients.find((node) => node.props.value === value)!);
    assert.equal(chosen, value);
    assert.match(text(output), /100% of fees/);
    assert.match(text(output), /1\s+unit is\s+the trading fee/);
    assert.match(text(output), /0% platform fee/);
  }
  assert.match(text(render({ ...defaults, feePips: 30_000 })), /Burned at collection/);
  assert.match(text(render({ ...defaults, feePips: 30_000 })), /3\s+units are\s+the trading fee/);
});

test("custom destination validates inline, labels the input, and follows the connected wallet honestly", () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let typed = "";
  const invalid = render({ ...defaults, feePips: 10_000, beneficiary: "custom", customAddress: "not-an-address", onCustomAddressChange: (value: string) => { typed = value; } });
  const addressInput = elements(invalid).find((node) => node.type === "input" && node.props.id === "fees-address")!;
  assert.equal(addressInput.props["aria-invalid"], true);
  assert.equal(addressInput.props["aria-describedby"], "fees-address-help");
  assert.equal(elements(invalid).find((node) => node.type === "label" && node.props.htmlFor === "fees-address")?.children[0], "Recipient address");
  assert.match(text(invalid), /Enter a valid 0x wallet address/);
  change(addressInput, ` ${wallet} `);
  assert.equal(typed, wallet);
  assert.match(text(render({ ...defaults, feePips: 10_000, beneficiary: "me" })), /Connect your wallet before launch/);
  const valid = render({ ...defaults, feePips: 10_000, beneficiary: "custom", customAddress: wallet });
  assert.equal(elements(valid).find((node) => node.props.id === "fees-address")?.props["aria-invalid"], false);
  assert.match(text(valid), /Claimable by/);
  assert.ok(text(valid).includes(shortAddr(wallet)));
});

test("fee redesign preserves parent validation and the exact single-recipient launch payload", () => {
  assert.match(formSource, /feePips > 0 && beneficiary === "custom" && !isAddress\(customAddr\.trim\(\)\)/);
  assert.match(formSource, /onFeeChange=\{setFeePips\}/);
  assert.match(formSource, /onBeneficiaryChange=\{setBeneficiary\}/);
  const formAst = ts.createSourceFile("LaunchForm.tsx", formSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(formAst) === "recipients" && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(formAst);
  assert.ok(callback);
  const { outputText: recipientCode } = ts.transpileModule(`(${callback.getText(formAst)})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  const address = "0x1111111111111111111111111111111111111111";
  const customAddr = "0x2222222222222222222222222222222222222222";
  const recipients = (feePips: number, beneficiary: string) => JSON.parse(JSON.stringify(runInNewContext(recipientCode, { feePips, beneficiary, address, customAddr, BPS })));
  assert.deepEqual(recipients(0, "me"), []);
  assert.deepEqual(recipients(10_000, "burn"), []);
  assert.deepEqual(recipients(10_000, "me"), [{ payout: address, bps: BPS }]);
  assert.deepEqual(recipients(30_000, "custom"), [{ payout: customAddr, bps: BPS }]);
  assert.match(formSource, /lpFee: feePips,/);
  assert.doesNotMatch(formSource, /Coming soon/);
  assert.match(formSource, /Not configured here\. Contract settings are missing in this environment\./);
});

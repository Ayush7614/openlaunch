import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { minOut } from "../../lib/launchpad/math.ts";

const source = readFileSync(new URL("./LaunchForm.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("LaunchForm.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test("launch merge preserves optional funding checks and post-launch buy isolation", () => {
  assert.match(source, /initialBuyRaw && address && buyBalance === undefined/);
  assert.match(source, /initialBuyRaw \+ \(quote\.key === "eth" \? GAS_RESERVE_WEI : 0n\) > buyBalance/);
  assert.match(source, /if \(initialBuyRaw && ev\?\.args\.token\) \{\s*try \{/);
  assert.match(source, /buyProblem = friendlyError\(err, \{ slippagePct: FIRST_BUY_SLIPPAGE_BPS \/ 100 \}\)/);
  assert.ok(source.indexOf('if (receipt.status !== "success")') < source.indexOf("await firstBuy("));
  assert.match(source, /if \(buyHash\) await fetch\(`\/api\/launch\/sync\?chain=\$\{chain\}&tx=\$\{buyHash\}/);
  assert.match(source, /Launched, but the first buy did not go through/);
  assert.match(source, /buying: "Launched! Buying your first tokens…"/);
});

test("launch merge retains chain-scoped marks and honest optional-buy copy", () => {
  assert.match(source, /<TokenAvatar chain=\{chain\}/);
  assert.match(source, /label=\{initialBuyRaw \? "Launch \+ optional buy" : "Launch for free, gas only"\}/);
  assert.match(source, /Other traders can buy before you/);
  assert.match(source, /First-buy slippage tolerance: \{FIRST_BUY_SLIPPAGE_BPS \/ 100\}%/);
  assert.match(source, /Network gas and pool fees apply/);
  assert.doesNotMatch(source, /first holder/i);
  const copy: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) copy.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(copy.every((text) => !text.includes("\u2014")), "Authored copy must not restore em dashes");
});

for (const status of ["success", "reverted"]) {
  test(`optional native buy preserves 3% tolerance and handles a ${status} receipt`, async () => {
    let declaration = "";
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "firstBuy") declaration = node.getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(declaration);
    let encodedMinimum: bigint | undefined;
    let sentValue: bigint | undefined;
    const { outputText } = ts.transpileModule(`(${declaration})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } });
    // Inert wallet/RPC dependencies: no connection, signature or network request.
    const firstBuy = runInNewContext(outputText, {
      TICK_SPACING: 200, zeroAddress: "zero", V4_QUOTER_ABI: [], UNIVERSAL_ROUTER_ABI: [], ERC20_TRANSFER_EVENT: {},
      FIRST_BUY_SLIPPAGE_BPS: 300, BUILDER_DATA_SUFFIX: "0x", minOut,
      encodeV4ExactInSingle: (input: { minOut: bigint }) => { encodedMinimum = input.minOut; return { commands: "0x10", inputs: [] }; },
      parseEventLogs: () => [
        { address: "token", args: { to: "wallet", value: 975n } },
        { address: "other-token", args: { to: "wallet", value: 500n } },
        { address: "token", args: { to: "other-wallet", value: 20n } },
      ],
    }) as (ctx: unknown, token: string, hash: string, amount: bigint) => Promise<{ hash: string; out: bigint; exact: boolean }>;
    const result = firstBuy({
      pub: {
        simulateContract: async (input: { functionName: string; value?: bigint }) => {
          if (input.functionName === "quoteExactInputSingle") return { result: [1_000n] };
          sentValue = input.value;
          return { request: {} };
        },
        waitForTransactionReceipt: async () => ({ status, logs: [] }),
      },
      wallet: { writeContract: async () => "buy-hash" }, address: "wallet",
      V4: { quoter: "quoter", universalRouter: "router", swapLayout: "v1" }, quote: { key: "eth", address: "zero" },
      feePips: 0, CHAIN: { id: 8453 }, setPhase: () => {},
    }, "token", "launch-hash", 100n);
    if (status === "success") {
      const bought = await result;
      assert.equal(bought.hash, "buy-hash");
      assert.equal(bought.out, 975n, "Only this token received by this wallet is counted");
      assert.equal(bought.exact, true);
    } else {
      await assert.rejects(result, /The buy reverted on-chain/);
    }
    assert.equal(encodedMinimum, 970n);
    assert.equal(sentValue, 100n);
  });
}

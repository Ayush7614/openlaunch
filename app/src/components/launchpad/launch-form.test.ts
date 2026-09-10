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
  const receiptCheck = source.indexOf('if (receipt.status !== "success")');
  const buyCall = source.indexOf("await firstBuy(");
  assert.ok(receiptCheck >= 0, "Launch receipt status check must remain");
  assert.ok(buyCall >= 0, "Optional first buy call must remain");
  assert.ok(receiptCheck < buyCall, "The receipt status check must run before the first buy");
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
  // (no em-dash policing: the site copy voice is the maintainers' call)
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

test("stock quote: one blocking message, a chip that names the issuer, a way out, and no test hooks in production markup", () => {
  // the sentence lives once and is shown by the validation list and the submit-card status box
  assert.match(source, /const STOCK_PICK_MESSAGE = "Pick a stock to price the token in, or switch the quote\."/);
  assert.equal(source.match(/STOCK_PICK_MESSAGE/g)?.length, 3);
  assert.match(source, /if \(quoteKey === "stock" && !stock\) errors.push\(STOCK_PICK_MESSAGE\)/);
  assert.match(source, /\{quoteKey === "stock" && !stock \? \(\s*<div className="[^"]*" role="status">\s*\{STOCK_PICK_MESSAGE\}/);
  // the only live region is that status box: the search results must not be re-announced on every keystroke
  assert.doesNotMatch(source, /aria-live/);
  assert.doesNotMatch(source, /data-testid|\(registry\)|Quote = \{/);
  // the picked stock chip says whose stock it is and can be cleared; "Switch quote" returns to the first configured quote
  assert.match(source, /\{stock\.symbol\}\s*<span className="[^"]*">\{chain === "base" \? "Coinbase stock" : "Robinhood stock"\}<\/span>/);
  assert.match(source, /aria-label="clear stock quote"/);
  assert.match(source, /Switch quote/);
  assert.match(source, /setQuoteKey\(cfg\.quotes\[0\]\?\.key \?\? "eth"\);\s*setStock\(null\);\s*setStockQ\(""\);\s*setMcapPick\(null\);\s*setCustomMcap\(""\);/);
  // the issuer disclaimer is rendered from one helper for both chains
  assert.match(source, /<p className=\{helper\}>\{stockIssuerDisclaimer\(chain\)\}<\/p>/);
});

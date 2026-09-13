import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { validateMeta } from "../../lib/launchpad/metaShared.ts";

const source = readFileSync(new URL("./LaunchForm.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("LaunchForm.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function attribute(name: string): ts.JsxAttribute | undefined {
  let input: ts.JsxSelfClosingElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "input" && node.attributes.properties.some(
      (prop) => ts.isJsxAttribute(prop) && prop.name.getText(ast) === "id" && prop.initializer && ts.isStringLiteral(prop.initializer) && prop.initializer.text === "symbol",
    )) input = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(input, "Test the real Symbol input");
  return input.attributes.properties.find((prop): prop is ts.JsxAttribute => ts.isJsxAttribute(prop) && prop.name.getText(ast) === name);
}

function handler(name: string, globals: Record<string, unknown> = {}) {
  const value = attribute(name)?.initializer;
  assert.ok(value && ts.isJsxExpression(value) && value.expression, `Symbol needs ${name}`);
  const { outputText } = ts.transpileModule(`(${value.expression.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  // Execute the actual handler, with inert dependencies. No wallet or RPC calls.
  return runInNewContext(outputText, globals) as (event: unknown) => void;
}

test("Symbol preserves typed, pasted and in-progress IME text verbatim", () => {
  let stored = "";
  const change = handler("onChange", { setSymbol: (value: string) => { stored = value; } });
  for (const value of ["s", "sk", "sky", "zhong", "中文", "にほん", "日本", "தமிழ்", "ß", "é", "e\u0301", " ab12 ", "ABCDEFGHIJK", ""]) {
    change({ target: { value }, nativeEvent: { isComposing: true } });
    assert.equal(stored, value, `Do not rewrite ${JSON.stringify(value)} during editing`);
  }
  assert.doesNotMatch(attribute("className")!.getText(ast), /\buppercase\b/, "CSS must not change the composition display either");
  assert.equal(attribute("maxLength"), undefined, "Validate the finished value instead of truncating an IME composition or paste");
});

test("Enter confirms composition without implicitly submitting the launch form", () => {
  const keyDown = handler("onKeyDown");
  for (const [key, isComposing, keyCode, expected] of [
    ["Enter", true, 13, true],
    ["Enter", false, 229, true], // Some IMEs end composition before keydown.
    ["Enter", false, 13, false],
    ["a", true, 229, false],
  ] as const) {
    let prevented = false;
    keyDown({ key, nativeEvent: { isComposing, keyCode }, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, expected);
  }
});

test("Symbol guidance is associated with the field and the existing launch rules stay intact", () => {
  assert.equal(attribute("aria-describedby")?.initializer?.getText(ast), '"symbol-help"');
  assert.match(source, /id="symbol-help"/);
  assert.match(source, /A.Z.*0.9/);
  assert.match(source, /const symbolClean = symbol\.trim\(\)\.toUpperCase\(\)/);
  assert.match(source, /symbol: symbolClean/);
  assert.match(source, /className="[^"]*truncate"[^>]*>\{symbolClean \|\| "TICKER"\}/, "Overlong input must not overflow the preview");
  assert.match(source, /className="break-all">\{symbolClean \|\| "tokens"\}/, "The buy estimate must wrap overlong input too");
  const base = { chain: "base" as const, launcher: "0x00000000000000000000000000000000000c0ffe", salt: `0x${"a".repeat(64)}`, name: "中文" };
  for (const [symbol, valid] of [[" sky9 ", true], ["ABCDEFGHIJ", true], ["ABCDEFGHIJK", false], ["中文", false], ["தமிழ்", false], ["SK Y", false], ["", false]] as const) {
    const result = validateMeta({ ...base, symbol });
    assert.equal(result.ok, valid, symbol);
    if (result.ok) {
      assert.equal(result.value.symbol, symbol.trim().toUpperCase());
      assert.equal(result.value.name, "中文", "Names can still use other languages");
    }
  }
});

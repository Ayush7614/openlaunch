import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

// Check authored copy, not comments, regular expressions or user-supplied data.
test("site display copy contains no em dashes; signed protocol headers stay unchanged", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const violations: string[] = [];
  const emDash = /\u2014|&(?:mdash|#0*8212|#x0*2014);/i;
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { inspect(file); continue; }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        // Byte-exact wallet payloads are shared with signature verification.
        // Do not turn a punctuation cleanup into a protocol migration.
        if (path.relative(root, file).replaceAll("\\", "/") === "lib/launchpad/posts.ts" && ts.isTemplateTail(node) && [
          " \u2014 sign to post. Free, no transaction.",
          " \u2014 sign to report a post.",
          " \u2014 sign a moderation action.",
        ].includes(node.text)) return;
        if ((ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && emDash.test(node.text)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          violations.push(`${path.relative(root, file)}:${line + 1}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  inspect(root);
  assert.deepEqual(violations, [], `Em dashes remain in authored copy: ${violations.join(", ")}`);
});

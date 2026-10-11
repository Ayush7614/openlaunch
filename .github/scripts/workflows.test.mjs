// The workflow files keep the properties the pull request guard depends on.  node --test .github/scripts/workflows.test.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { OWNERS } from "./pr-guard.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = `${root}.github/workflows/`;
const workflows = Object.fromEntries(readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).map((name) => [name, readFileSync(dir + name, "utf8")]));
/** Lines that are not comments, with their trailing comments kept (a pinned action names its release there). */
const lines = (text) => text.split("\n").filter((line) => !/^\s*#/.test(line));
const guard = workflows["pr-guard.yml"];
/** Every shell command a workflow runs: `run: command`, or the lines of a `run: |` block. */
function commands(text) {
  const out = [];
  const all = lines(text);
  for (let i = 0; i < all.length; i++) {
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(all[i]);
    if (!m) continue;
    if (!/^[|>][+-]?$/.test(m[2])) { out.push(m[2]); continue; }
    for (i++; i < all.length && (all[i].trim() === "" || all[i].search(/\S/) > m[1].length); i++) if (all[i].trim()) out.push(all[i].trim());
    i--;
  }
  return out;
}

test("the two workflows exist", () => {
  assert.deepEqual(Object.keys(workflows).sort(), ["ci.yml", "pr-guard.yml"]);
});

test("every action is pinned to a full commit SHA, with its release in a comment", () => {
  let seen = 0;
  for (const [name, text] of Object.entries(workflows)) {
    for (const line of lines(text)) {
      const uses = /^\s*(?:-\s+)?uses:\s*(.+)$/.exec(line)?.[1];
      if (uses === undefined) continue;
      seen++;
      assert.match(uses, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${name}: ${uses}`);
    }
  }
  assert.ok(seen >= 6);
});

test("only the guard runs in the base repository's context on outside input", () => {
  for (const [name, text] of Object.entries(workflows)) {
    const privileged = /\b(pull_request_target|workflow_run|issue_comment|pull_request_review(_comment)?|discussion(_comment)?|issues)\s*:/.test(lines(text).join("\n"));
    assert.equal(privileged, name === "pr-guard.yml", name);
  }
});

test("no workflow asks for a write permission, and none reads a secret", () => {
  for (const [name, text] of Object.entries(workflows)) {
    const body = lines(text).join("\n");
    assert.match(body, /^permissions:/m, `${name} sets permissions at the top`);
    assert.doesNotMatch(body, /:\s*write\b|write-all/, name);
    assert.doesNotMatch(body, /\bsecrets\.|\bsecrets\[/, name);
  }
});

test("the guard job is named pr-guard, the name the branch rules require", () => {
  assert.match(guard, /^jobs:\n {2}pr-guard:\n {4}name: pr-guard$/m);
  assert.match(guard, /^permissions: \{\}$/m);
  assert.match(guard, /^ {6}contents: read\n {6}pull-requests: read$/m);
  assert.match(guard, /branches: \[main\]/);
});

test("the guard never checks out or runs the pull request", () => {
  const body = lines(guard).join("\n");
  // the one checkout stays on the base commit: no ref, no credentials left behind
  assert.equal(body.match(/uses: actions\/checkout@/g).length, 1);
  assert.doesNotMatch(body, /^\s*(ref|repository|submodules|token|ssh-key):/m);
  assert.match(body, /persist-credentials: false/);
  // nothing is installed or built, and the only programs are git and the guard script from this checkout
  assert.deepEqual(commands(guard).map((command) => command.split(" ").slice(0, 2).join(" ")), ["git fetch", "git cat-file", "node .github/scripts/pr-guard.mjs"]);
  assert.doesNotMatch(body, /\b(npm|npx|yarn|pnpm|bun|pip|forge|curl|wget|bash|sh -c)\b/);
});

test("pull request data reaches the guard's shell only through environment variables", () => {
  for (const line of lines(guard)) {
    if (!line.includes("${{")) continue;
    assert.match(line, /^\s+(group|[A-Z][A-Z0-9_]*): .*\$\{\{ [\w.]+ \}\}$/, line.trim());
  }
  // the head commit is read by its SHA from the event, not by a branch name the author controls
  assert.match(guard, /GUARD_HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(guard, /head\.ref|head_ref|head\.label|pull_request\.title|pull_request\.body/);
});

test("ci never uses pull_request_target and runs the lock check and the guard's tests", () => {
  const ci = workflows["ci.yml"];
  assert.match(ci, /^ {2}pull_request:$/m);
  assert.match(ci, /run: script\/check-deployed-sources\.sh/);
  assert.match(ci, /run: script\/check-arc-factory\.sh/);
  assert.match(ci, /run: node --test \.github\/scripts\/pr-guard\.test\.mjs \.github\/scripts\/workflows\.test\.mjs/);
  assert.match(ci, /foundry-toolchain@[0-9a-f]{40} # v\d+\.\d+\.\d+\n\s+with:\n\s+version: v\d+\.\d+\.\d+/, "the Foundry version is pinned");
});

test("code owners and the guard name the same people, and cover the guarded paths", () => {
  const owners = readFileSync(`${root}.github/CODEOWNERS`, "utf8");
  const rules = owners.split("\n").filter((line) => line && !line.startsWith("#")).map((line) => line.split(/\s+/));
  for (const [path, ...names] of rules) assert.deepEqual(names, OWNERS.map((login) => `@${login}`), path);
  for (const path of ["/contracts/", "/.github/", "/app/package.json", "/app/package-lock.json"]) assert.ok(rules.some(([p]) => p === path), path);
});

test("the lock names files that exist, and every deployed source is in it", () => {
  const lock = readFileSync(`${root}contracts/deployed.lock`, "utf8");
  const entries = lock.split("\n").filter((line) => /^(sha256|gitlink) /.test(line)).map((line) => line.split(/\s+/));
  assert.ok(entries.length >= 13);
  for (const [kind, value, path] of entries) {
    assert.match(value, kind === "sha256" ? /^[0-9a-f]{64}$/ : /^[0-9a-f]{40}$/, path);
    if (kind === "sha256") assert.doesNotThrow(() => readFileSync(root + path), path);
  }
  const locked = new Set(entries.map(([, , path]) => path));
  for (const path of ["contracts/src/LaunchFactory.sol", "contracts/src/LaunchFactoryArc.sol", "contracts/src/LaunchLocker.sol", "contracts/src/LaunchToken.sol", "contracts/foundry.toml", "contracts/remappings.txt", ".gitmodules", "contracts/lib/forge-std", "contracts/lib/v4-periphery"]) {
    assert.ok(locked.has(path), path);
  }
});

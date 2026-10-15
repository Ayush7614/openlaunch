import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Source contracts for Boost (like earn-ui.test.ts): they hold the rules that keep a paid lane honest in place.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const dialog = read("./BoostDialog.tsx");
const panel = read("./BoostPanel.tsx");
const lane = read("./BoostedLane.tsx");
const admin = read("./BoostAdmin.tsx");
const rulesEntry = read("./BoostRulesEntry.tsx");
const rules = read("../../app/rules/page.tsx");
const dashboard = read("./MeDashboard.tsx");
const server = read("../../lib/launchpad/boostServer.ts");
const indexer = read("../../lib/launchpad/indexer.ts");
const queries = read("../../lib/launchpad/queries.ts");
const liveRoute = read("../../app/api/launch/live/route.ts");
const boostRoute = read("../../app/api/boost/route.ts");
const llms = read("../../app/llms.txt/route.ts");
const home = read("../../app/(home)/page.tsx");
const tokenPage = read("../../app/t/[chain]/[token]/page.tsx");

test("the ranking never reads boosts: no paid row can enter the Live sort or the Trending board", () => {
  // boost code, not the English word (the board's own copy says fresh tokens "get a boost" in score)
  const BOOST_CODE = /from ["'][^"']*[bB]oost[^"']*["']|bb_boosts|BOOST_|[bB]oostLane|useBoostOn|getTokenBoost|live\.boost|snap\.boost/;
  for (const f of ["../../lib/launchpad/ranking.ts", "../../lib/launchpad/trending-live.ts", "../../lib/launchpad/trending-board.ts", "./TrendingStrip.tsx", "./LaunchList.tsx"]) {
    assert.doesNotMatch(read(f), BOOST_CODE, f);
  }
  // queries.ts names bb_boosts only inside getLaunchTotals (the TWIG burned figure), never in a list or ranking query
  const start = queries.indexOf("export async function getLaunchTotals(");
  const end = queries.indexOf("\n}\n", start);
  assert.ok(start > 0 && end > start);
  // the one import it needs is the chain id the totals filter on
  const IMPORT = 'import { BOOST_CHAIN_ID } from "./boost";\n';
  assert.equal(queries.split(IMPORT).length, 2, "exactly one boost import, the chain id");
  const outside = (queries.slice(0, start) + queries.slice(end)).replace(IMPORT, "");
  assert.doesNotMatch(outside, BOOST_CODE);
  assert.match(queries.slice(start, end), /FROM bb_boosts WHERE chain_id = \$\{BOOST_CHAIN_ID\}/);
});

test("a boost is one plain TWIG transfer to 0x…dEaD: simulated, credited to the builder code, never an approval", () => {
  assert.match(dialog, /simulateContract\(\{ address: BOOST_TOKEN as `0x\$\{string\}`, abi: ERC20_TRANSFER_ABI, functionName: "transfer", args: \[DEAD, raw\], account: address, dataSuffix: BUILDER_DATA_SUFFIX \}\)/);
  assert.equal((dialog.match(/writeContract\(/g) ?? []).length, 1);
  assert.match(dialog, /wallet\.writeContract\(request\)/);
  assert.doesNotMatch(dialog, /approve|maxUint|sendTransaction|signMessage/);
  // the amount is built from the launch's own position id, only once the checks pass
  assert.match(dialog, /whole !== null && problem === null \? boostAmount\(whole, tag\) : null/);
  assert.match(dialog, /const tag = BigInt\(tokenId\)/);
  // the transfer ABI is reachable from the dialog alone
  const users = walk(path.resolve(import.meta.dirname, "../..")).filter((f) => !f.endsWith(".test.ts") && readFileSync(f, "utf8").includes("ERC20_TRANSFER_ABI"));
  assert.deepEqual(users.map((f) => path.basename(f)).sort(), ["BoostDialog.tsx", "abi.ts"]);
});

test("the send locks before its first await and simulates before the wallet is asked", () => {
  const body = dialog.slice(dialog.indexOf("async function send()"));
  const lockAt = body.indexOf("lock.current = true");
  assert.ok(lockAt > 0 && lockAt < body.indexOf("await"), "lock before the first await");
  assert.ok(body.indexOf("simulateContract") < body.indexOf("writeContract"), "simulate before write");
  assert.match(body, /if \(chainId !== BASE\.id\) await switchChainAsync\(\{ chainId: BASE\.id \}\)/);
});

test("sent means sent: an unread receipt locks the dialog instead of inviting a second burn", () => {
  const body = dialog.slice(dialog.indexOf("async function send()"), dialog.indexOf("async function settle("));
  // the hash is handed to the panel before the receipt wait, and a failed wait is "unconfirmed", never "error"
  assert.ok(body.indexOf("onPending({ hash, whole })") < body.indexOf("waitForTransactionReceipt"));
  assert.match(body, /catch \{\n\s*\/\/ sent, outcome unknown[^\n]*\n\s*setPhase\(\{ k: "unconfirmed", hash, whole, checking: false, note: null \}\);\n\s*return;/);
  assert.match(dialog, /const busy = phase\.k === "preparing" \|\| phase\.k === "signing" \|\| phase\.k === "sent" \|\| phase\.k === "unconfirmed";/);
  assert.match(dialog, /useState<Phase>\(pending \? \{ k: "unconfirmed", \.\.\.pending, checking: false, note: null \} : \{ k: "idle" \}\)/);
  // the panel owns the pending hash, so closing and reopening keeps the lock
  assert.match(panel, /pending=\{pending\} onPending=\{setPending\}/);
  // only a receipt settles it, and the sync call indexes it at once
  assert.match(dialog, /await fetch\(`\/api\/launch\/sync\?chain=\$\{BOOST_CHAIN\}&tx=\$\{hash\}`, \{ method: "POST" \}\)/);
});

test("the dialog says where the TWIG goes, that it is final, and that the ranking is untouched", () => {
  for (const key of ["what", "tag", "final"]) assert.match(dialog, new RegExp(`BOOST_COPY\\.${key}`), key);
  assert.match(dialog, /0x…dEaD \(burned\)/);
  assert.match(dialog, /Platform fee<\/dt><dd[^>]*>\$0/);
});

test("everything stays dark while BOOST is off", () => {
  assert.match(server, /return process\.env\.BOOST\?\.trim\(\)\.toLowerCase\(\) === "on";/);
  assert.match(lane, /if \(!lane\.enabled\) return null;/);
  assert.match(panel, /if \(!state\.enabled\) return null;/);
  assert.match(admin, /if \(lane && !lane\.enabled\) return null;/);
  assert.match(rules, /\{boostEnabled\(\) \? <BoostRulesEntry \/> : null\}/);
  assert.doesNotMatch(rulesEntry, /"use client"/);
  assert.match(dashboard, /boostOn && l\.chain === BOOST_CHAIN \?/);
  assert.match(llms, /if \(!boostEnabled\(\)\) return "";/);
  assert.match(boostRoute, /if \(!boostEnabled\(\)\) return NextResponse\.json\(\{ enabled: false \}/);
  assert.match(tokenPage, /const boostable = chain === BOOST_CHAIN && boostEnabled\(\);/);
});

test("a failed lane read never breaks a page or blanks open tabs", () => {
  assert.match(server, /\.catch\(\(err\) => \{\n\s*console\.warn\("\[boost\] lane read failed:"/);
  assert.match(liveRoute, /boost: boost \?\? undefined/);
  assert.match(home, /<BoostedLane initial=\{boost \?\? \{ enabled: false \}\} serverNow=\{now\} \/>/);
  assert.match(lane, /if \(snap\.boost\) setLane\(snap\.boost\);/);
  // the lane sits after the facts-only board, never inside it
  assert.ok(home.indexOf("<TrendingStrip") < home.indexOf("<BoostedLane"));
});

test("the indexer reads TWIG transfers to 0x…dEaD on Base only and skips the locker's fee burns", () => {
  assert.match(indexer, /const twig = TWIG_ADDRESSES\[chain\];\n\s*if \(twig\) \{\n\s*const burnLogs = await fetchLogsSplit\(\(f, t\) => client\.getLogs\(\{ address: twig as Address, event: ERC20_TRANSFER_EVENT, args: \{ to: DEAD \}, fromBlock: f, toBlock: t \}\), from, to\);/);
  assert.match(indexer, /applyBoost\(db, chain, l as Log & \{ args: TransferArgs \}, locker\.toLowerCase\(\)\)/);
  assert.match(indexer, /applyBoost\(db, chain, l as unknown as Log & \{ args: TransferArgs \}, locker\)/);
  assert.match(indexer, /INSERT INTO bb_boosts \(chain_id, tx_hash, log_index, booster, amount, tag, block_number, block_time\)[\s\S]*?ON CONFLICT DO NOTHING/);
});

test("moderation is admin-only, signed over its own message, with a single-use nonce", () => {
  const body = server.slice(server.indexOf("export async function moderateBoost("));
  const adminAt = body.indexOf("if (!adminWallets().has(wallet)) return fail(\"admin only\", 403);");
  const verifyAt = body.indexOf("await verify(BOOST_CHAIN, wallet, message, p.signature)");
  const nonceAt = body.indexOf("await consumeNonce(p.nonce, wallet)");
  const writeAt = body.indexOf("INSERT INTO bb_token_settings");
  assert.ok(adminAt > 0 && adminAt < verifyAt && verifyAt < nonceAt && nonceAt < writeAt);
  assert.match(body, /const message = buildBoostModMessage\(/);
  // a hidden token is out of the lane, and its page offers no button
  assert.match(server, /AND NOT COALESCE\(s\.boost_hidden, false\)/);
  assert.match(panel, /\{state\.hidden \? \(\n\s*<p[^>]*>\{BOOST_COPY\.hidden\}<\/p>\n\s*\) : \(/);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

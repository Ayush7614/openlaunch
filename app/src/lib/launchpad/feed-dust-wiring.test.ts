import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fmtQuote } from "./math.ts";

// Source contracts for the dust fix: the feed query filters through feed-dust.ts, and every surface that shows a
// swap amount formats it with fmtQuote (which owns the display floor). These read the sources rather than run
// them: getLaunchFeed needs a database and the components need React; their pure parts are tested elsewhere.
const queries = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const feedQuery = queries.slice(queries.indexOf("export async function getLaunchFeed("), queries.indexOf("export type LaunchTotals"));
const tape = readFileSync(new URL("../../components/launchpad/LaunchTape.tsx", import.meta.url), "utf8");
const toasts = readFileSync(new URL("../../components/launchpad/TxToasts.tsx", import.meta.url), "utf8");
const trades = readFileSync(new URL("../../components/launchpad/TokenTrades.tsx", import.meta.url), "utf8");

test("getLaunchFeed over-fetches swaps and returns the dust-filtered list trimmed to the requested count", () => {
  assert.match(queries, /import \{ dropDust \} from "\.\/feed-dust";/);
  assert.match(feedQuery, /const swapN = 2 \* n;/, "twice the swaps so a dust burst cannot empty the feed");
  assert.match(feedQuery, /FROM bb_launch_swaps ORDER BY block_time DESC LIMIT \$\{swapN\}\)/, "the swap arm takes the over-fetch");
  assert.match(feedQuery, /ORDER BY l\.block_time DESC LIMIT \$\{n\}\)/, "the launch arm stays at n: launches are never filtered");
  assert.match(feedQuery, /\) x ORDER BY at DESC LIMIT \$\{n \+ swapN\}`/, "the union keeps every candidate row for the filter");
  assert.match(feedQuery, /return dropDust\(items, n\);\s*\}\s*$/, "the filter is the last thing the feed does");
  assert.doesNotMatch(feedQuery, /abs\(s\.amount0\) [<>]/, "no raw-wei floor in SQL: the rule prices first and lives in feed-dust.ts");
});

test("the tape, the toasts and the trade table all format swap amounts through fmtQuote with the quote's decimals", () => {
  assert.match(tape, /fmtQuote\(item\.quote_wei, item\.quote_decimals, item\.quote_symbol\)/);
  assert.match(toasts, /\$\{fmtQuote\(i\.quote_wei, i\.quote_decimals, i\.quote_symbol\)\} of \$\{i\.symbol\}/);
  assert.match(trades, /fmtQuote\(q < 0n \? -q : q, quote\.decimals, ""\)\.trim\(\)/);
  for (const src of [tape, toasts, trades]) assert.doesNotMatch(src, /fmtEth\(|fmtQuoteUnits\(/, "no surface bypasses fmtQuote for a swap amount");
});

test("the trade table's symbol-less cell reads \"<0.01\", not \"0\", for a dust row", () => {
  assert.equal(fmtQuote(4999n, 6, "").trim(), "<0.01");
  const q = -4999n; // a buy: the trader paid quote, amount0 is negative; the table passes the magnitude
  assert.equal(fmtQuote(q < 0n ? -q : q, 6, "").trim(), "<0.01");
  assert.equal(fmtQuote(1n, 18, "").trim(), "<0.00000001");
  assert.equal(fmtQuote(0n, 6, "").trim(), "0", "an exact zero is still 0");
});

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

test("getLaunchFeed pages swaps through collectNonDust and merges them with the newest launches", () => {
  assert.match(queries, /import \{ collectNonDust \} from "\.\/feed-dust";/);
  assert.match(feedQuery, /FROM bb_launches l LEFT JOIN bb_launch_meta m [^`]*ORDER BY l\.block_time DESC LIMIT \$\{n\}`/, "launches: the newest n, never filtered");
  assert.match(feedQuery, /collectNonDust\(/);
  assert.match(feedQuery, /FROM bb_launch_swaps ORDER BY block_time DESC, log_index DESC LIMIT \$\{size\} OFFSET \$\{offset\}\)/, "each swap page is a bounded, deterministic read");
  assert.match(feedQuery, /\(i\) => `\$\{i\.chain\}:\$\{i\.tx_hash\}:\$\{i\.token\}:\$\{i\.quote_wei\}`/, "the dedupe key matches the tape's");
  assert.match(feedQuery, /\.sort\(\(a, b\) => new Date\(b\.at\)\.getTime\(\) - new Date\(a\.at\)\.getTime\(\)\)\.slice\(0, n\);\s*\}\s*$/, "newest first, trimmed to n, last");
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

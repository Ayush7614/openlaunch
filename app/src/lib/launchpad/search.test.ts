import { test } from "node:test";
import assert from "node:assert/strict";
import { isAddressQuery, matchesFilter, matchesQuery, normalizeQuery, rankHit } from "./search.ts";

const row = (o: Partial<Parameters<typeof matchesQuery>[0]> = {}) => ({
  name: "Clear Sky",
  symbol: "SKY",
  token: "0x203e7cdcb0eb71087aeef09c4572efd4293008dc",
  lp_fee: 0,
  quote_symbol: "ETH",
  block_time: new Date(Date.now() - 3600_000).toISOString(),
  recipients: [{ payout: "0x000000000000000000000000000000000000dead", bps: 10000 }],
  ...o,
});

test("normalizeQuery strips $ and case", () => {
  assert.equal(normalizeQuery("  $SKY "), "sky");
  assert.equal(normalizeQuery("Clear   Sky"), "clear sky");
});

test("address queries match only the exact token", () => {
  assert.equal(isAddressQuery("0x203E7CDCB0EB71087AEEF09C4572EFD4293008DC"), true);
  assert.equal(matchesQuery(row(), "0x203E7CDCB0EB71087AEEF09C4572EFD4293008DC"), true);
  assert.equal(matchesQuery(row(), "0x0000000000000000000000000000000000000001"), false);
});

test("text queries match name or symbol substrings; empty matches all", () => {
  assert.equal(matchesQuery(row(), "sky"), true);
  assert.equal(matchesQuery(row(), "$sk"), true);
  assert.equal(matchesQuery(row(), "clear"), true);
  assert.equal(matchesQuery(row(), "dog"), false);
  assert.equal(matchesQuery(row(), ""), true);
});

test("filters: fee0 / burn / usdg / today", () => {
  assert.equal(matchesFilter(row(), "fee0"), true);
  assert.equal(matchesFilter(row({ lp_fee: 10_000 }), "fee0"), false);
  assert.equal(matchesFilter(row({ lp_fee: 10_000 }), "burn"), true, "1% + dead recipient = burn");
  assert.equal(matchesFilter(row({ lp_fee: 10_000, recipients: [{ payout: "0xabc", bps: 10000 }] }), "burn"), false);
  assert.equal(matchesFilter(row(), "burn"), false, "0% pools are not 'burn'");
  assert.equal(matchesFilter(row({ quote_symbol: "USDG" }), "usdg"), true);
  assert.equal(matchesFilter(row({ quote_symbol: "GITLAWB" }), "gitlawb"), true);
  assert.equal(matchesFilter(row({ quote_symbol: "ETH" }), "gitlawb"), false);
  assert.equal(matchesFilter(row(), "today"), true);
  assert.equal(matchesFilter(row({ block_time: new Date(Date.now() - 3 * 86_400_000).toISOString() }), "today"), false);
  assert.equal(matchesFilter(row(), null), true);
});

test("rankHit orders symbol exact < symbol prefix < name prefix < substring", () => {
  assert.equal(rankHit(row(), "sky"), 0);
  assert.equal(rankHit(row(), "sk"), 1);
  assert.equal(rankHit(row(), "clear"), 2);
  assert.equal(rankHit(row(), "ear"), 3);
});

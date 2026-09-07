import { test } from "node:test";
import assert from "node:assert/strict";
import { uniqueViolation, errMessage } from "./pg.ts";

/** Shape postgres.js throws: PostgresError { code, message, detail, constraint_name, … } */
function pgErr(constraint: string, detail?: string) {
  return Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
    code: "23505",
    constraint_name: constraint,
    detail,
    table_name: "bb_listings",
  });
}

test("uniqueViolation maps the bb_listings constraints to the same outcomes the handlers expect", () => {
  assert.equal(uniqueViolation(pgErr("bb_listings_tx_ref_key", "Key (tx_ref)=(x402_ab) already exists.")), "tx_ref");
  assert.equal(uniqueViolation(pgErr("bb_listings_product_nonce_key", "Key (product, token_nonce)=(listing, n1) already exists.")), "token_nonce");
  // constraint name alone is enough (detail can be absent with some server settings)
  assert.equal(uniqueViolation(pgErr("bb_listings_product_nonce_key")), "token_nonce");
  assert.equal(uniqueViolation(pgErr("bb_listings_tx_ref_key")), "tx_ref");
  // some other unique key (e.g. bb_entries_url_key) is "other", never silently treated as a replay
  assert.equal(uniqueViolation(pgErr("bb_entries_url_key")), "other");
});

test("uniqueViolation ignores everything that is not SQLSTATE 23505", () => {
  assert.equal(uniqueViolation(null), null);
  assert.equal(uniqueViolation(undefined), null);
  assert.equal(uniqueViolation(new Error("tx_ref is great but this is a plain error")), null);
  assert.equal(uniqueViolation(Object.assign(new Error("not null violation on tx_ref"), { code: "23502" })), null);
  assert.equal(uniqueViolation("string"), null);
});

test("errMessage flattens unknowns", () => {
  assert.equal(errMessage(new Error("boom")), "boom");
  assert.equal(errMessage("raw"), "raw");
  assert.equal(errMessage(42), "42");
});

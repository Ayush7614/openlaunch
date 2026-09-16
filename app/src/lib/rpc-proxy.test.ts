import assert from "node:assert/strict";
import test from "node:test";
import { upstreamStatus } from "./rpc-proxy.ts";

const ok = (id: number) => ({ jsonrpc: "2.0", id, result: "0x1" });
const err = (id: number, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

test("upstream replies clients cannot use become retryable statuses", () => {
  assert.equal(upstreamStatus(JSON.stringify([ok(1), ok(2)]), true, 2, 200), 200);
  assert.equal(upstreamStatus(JSON.stringify(ok(1)), false, 1, 200), 200);
  assert.equal(upstreamStatus(JSON.stringify([ok(1), err(2, 3, "execution reverted")]), true, 2, 200), 200); // real errors pass through
  // rate limiting inside a 200 body, by message or by code
  assert.equal(upstreamStatus(JSON.stringify([ok(1), err(2, -32016, "over rate limit")]), true, 2, 200), 429);
  assert.equal(upstreamStatus(JSON.stringify(err(1, -32000, "rate limit exceeded")), false, 1, 200), 429);
  assert.equal(upstreamStatus(JSON.stringify(err(1, -32005, "limit")), false, 1, 200), 429);
  assert.equal(upstreamStatus(JSON.stringify(err(1, 429, "Too Many Requests")), false, 1, 200), 429);
  // shape mismatches that would throw inside viem's batch scheduler
  assert.equal(upstreamStatus(JSON.stringify(err(1, -32016, "over rate limit")), true, 2, 200), 502); // single object for a batch
  assert.equal(upstreamStatus(JSON.stringify([ok(1)]), true, 2, 200), 502); // short batch
  assert.equal(upstreamStatus(JSON.stringify([ok(1)]), false, 1, 200), 502); // array for a single request
  assert.equal(upstreamStatus("<html>gateway timeout</html>", true, 1, 200), 502);
  assert.equal(upstreamStatus(JSON.stringify([null]), true, 1, 200), 502);
  // non-200 statuses are passed through untouched
  for (const status of [400, 403, 429, 500, 503]) assert.equal(upstreamStatus("{}", false, 1, status), status);
});
